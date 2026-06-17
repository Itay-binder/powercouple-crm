/**
 * Firestore-compatible adapter over Supabase (Postgres).
 *
 * This module reproduces the slice of the Firestore Admin SDK that the CRM uses,
 * backed by a single `fs_documents` table. The rest of the codebase keeps importing
 * the familiar Firestore API (collection/doc/where/orderBy/runTransaction/batch,
 * FieldValue, Timestamp) and never learns it is talking to Postgres.
 *
 * Document model: every document has a `path` ("leads/abc" or
 * "whatsappChats/972.../thread_messages/m1"), a `collection_path` (the path minus the
 * last segment) and a `collection_id` (the last segment of the collection path, used
 * for collectionGroup queries).
 */
import postgres, { type Sql } from "postgres";

// ----------------------------------------------------------------------------
// Connection
// ----------------------------------------------------------------------------
let _sql: Sql | null = null;

export function getSql(): Sql {
  if (_sql) return _sql;
  const url =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Missing SUPABASE_DB_URL (Supabase Postgres connection string)");
  _sql = postgres(url, {
    // Supabase's transaction pooler (pgbouncer) does not support prepared statements.
    prepare: false,
    max: Number(process.env.SUPABASE_DB_POOL_MAX || 5),
    idle_timeout: 20,
    connect_timeout: 15,
  });
  return _sql;
}

type Exec = Sql; // a postgres() instance OR a transaction handle — same call signature

// ----------------------------------------------------------------------------
// Sentinels / value types (FieldValue, Timestamp)
// ----------------------------------------------------------------------------
const TS_TAG = "__fs_ts__";
const SERVER_TS = "__fs_server_ts__";
const DELETE_OP = "__fs_delete__";

export class Timestamp {
  readonly iso: string;
  private constructor(iso: string) {
    this.iso = iso;
  }
  static fromDate(d: Date): Timestamp {
    return new Timestamp(d.toISOString());
  }
  static fromMillis(ms: number): Timestamp {
    return new Timestamp(new Date(ms).toISOString());
  }
  static fromISO(iso: string): Timestamp {
    return new Timestamp(iso);
  }
  static now(): Timestamp {
    return new Timestamp(new Date().toISOString());
  }
  toDate(): Date {
    return new Date(this.iso);
  }
  toMillis(): number {
    return new Date(this.iso).getTime();
  }
  get seconds(): number {
    return Math.floor(this.toMillis() / 1000);
  }
  get nanoseconds(): number {
    return 0;
  }
  isEqual(other: Timestamp): boolean {
    return other instanceof Timestamp && other.iso === this.iso;
  }
  toJSON() {
    return { [TS_TAG]: this.iso };
  }
  toString() {
    return this.iso;
  }
}

export class FieldValue {
  readonly _op: string;
  private constructor(op: string) {
    this._op = op;
  }
  static serverTimestamp(): FieldValue {
    return new FieldValue(SERVER_TS);
  }
  static delete(): FieldValue {
    return new FieldValue(DELETE_OP);
  }
  isEqual(other: FieldValue): boolean {
    return other instanceof FieldValue && other._op === this._op;
  }
}

// A marker used internally during merges to signal "remove this key".
const DELETE_MARKER = Symbol("delete");

// ----------------------------------------------------------------------------
// Encode (JS -> JSONB) / Decode (JSONB -> JS)
// ----------------------------------------------------------------------------
/** Convert app values into the JSON we persist. Returns DELETE_MARKER for FieldValue.delete(). */
function encode(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof FieldValue) {
    if (value._op === SERVER_TS) return { [TS_TAG]: new Date().toISOString() };
    if (value._op === DELETE_OP) return DELETE_MARKER;
    return undefined;
  }
  if (value instanceof Timestamp) return { [TS_TAG]: value.iso };
  if (value instanceof Date) return { [TS_TAG]: value.toISOString() };
  if (Array.isArray(value)) {
    return value.map((v) => {
      const e = encode(v);
      return e === undefined || e === DELETE_MARKER ? null : e;
    });
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const e = encode(v);
      if (e === undefined) continue;
      out[k] = e; // DELETE_MARKER kept here; applied during merge
    }
    return out;
  }
  return value;
}

/** Rehydrate persisted JSON back into app values (tagged timestamps -> Timestamp). */
function decode(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(decode);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj[TS_TAG] === "string" && Object.keys(obj).length === 1) {
      return Timestamp.fromISO(obj[TS_TAG] as string);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = decode(v);
    return out;
  }
  return value;
}

/** Shallow top-level merge of `incoming` onto `base`, honouring DELETE_MARKER. */
function mergeData(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === DELETE_MARKER) delete out[k];
    else out[k] = v;
  }
  return out;
}

/** Strip DELETE_MARKER from a full (non-merge) write. */
function stripDeletes(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== DELETE_MARKER) out[k] = v;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Path / id helpers
// ----------------------------------------------------------------------------
const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function genId(): string {
  let id = "";
  for (let i = 0; i < 20; i++) {
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return id;
}

function lastSegment(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}
function collectionPathOf(docPath: string): string {
  const parts = docPath.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

const SAFE_FIELD = /^[A-Za-z0-9_][A-Za-z0-9_.\-]*$/;
function assertField(field: string): string {
  if (!SAFE_FIELD.test(field)) {
    throw new Error(`Unsupported field name in query: ${field}`);
  }
  return field;
}

/** scalar -> the text Postgres' ->> operator would return for the same JSON value */
function scalarText(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/** comparable text for ==/range — a tagged Timestamp/Date compares by ISO string. */
function comparableValue(value: unknown): { isTs: boolean; text: string } {
  if (value instanceof Timestamp) return { isTs: true, text: value.iso };
  if (value instanceof Date) return { isTs: true, text: value.toISOString() };
  return { isTs: false, text: scalarText(value) };
}

// ----------------------------------------------------------------------------
// Snapshots
// ----------------------------------------------------------------------------
export class DocumentSnapshot {
  constructor(
    readonly ref: DocumentReference,
    private readonly _raw: Record<string, unknown> | null
  ) {}
  get id(): string {
    return this.ref.id;
  }
  get exists(): boolean {
    return this._raw !== null;
  }
  // Firestore-compat: document fields are dynamically typed (`any`), mirroring
  // firebase-admin's DocumentData so existing field access keeps type-checking.
  data(): DocumentData | undefined {
    return this._raw === null ? undefined : (decode(this._raw) as DocumentData);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(field: string): any {
    const d = this.data();
    if (!d) return undefined;
    // support simple dotted field access
    return field
      .split(".")
      .reduce<unknown>((acc, k) => (acc == null ? undefined : (acc as Record<string, unknown>)[k]), d);
  }
}

export class QueryDocumentSnapshot extends DocumentSnapshot {
  data(): DocumentData {
    return super.data() as DocumentData;
  }
}

export class QuerySnapshot {
  constructor(readonly docs: QueryDocumentSnapshot[]) {}
  get empty(): boolean {
    return this.docs.length === 0;
  }
  get size(): number {
    return this.docs.length;
  }
  forEach(cb: (doc: QueryDocumentSnapshot) => void): void {
    this.docs.forEach(cb);
  }
}

// ----------------------------------------------------------------------------
// DocumentReference
// ----------------------------------------------------------------------------
export class DocumentReference<_T = DocumentData> {
  constructor(readonly path: string) {}

  get id(): string {
    return lastSegment(this.path);
  }
  get parent(): CollectionReference {
    return new CollectionReference(collectionPathOf(this.path));
  }
  /** Firestore-compat: the owning Firestore instance. */
  get firestore(): Firestore {
    return getFirestore();
  }
  collection(name: string): CollectionReference {
    return new CollectionReference(`${this.path}/${name}`);
  }

  async get(exec: Exec = getSql()): Promise<DocumentSnapshot> {
    const rows = await exec.unsafe<{ data: Record<string, unknown> }[]>(
      `select data from fs_documents where path = $1 limit 1`,
      [this.path]
    );
    return new DocumentSnapshot(this, rows.length ? rows[0].data : null);
  }

  /** SELECT ... FOR UPDATE, used inside transactions. */
  async getForUpdate(exec: Exec): Promise<DocumentSnapshot> {
    const rows = await exec.unsafe<{ data: Record<string, unknown> }[]>(
      `select data from fs_documents where path = $1 limit 1 for update`,
      [this.path]
    );
    return new DocumentSnapshot(this, rows.length ? rows[0].data : null);
  }

  async set(
    data: Record<string, unknown>,
    options?: { merge?: boolean },
    exec: Exec = getSql()
  ): Promise<void> {
    const encoded = encode(data) as Record<string, unknown>;
    const collPath = collectionPathOf(this.path);
    const collId = lastSegment(collPath);
    if (options?.merge) {
      const current = await exec.unsafe<{ data: Record<string, unknown> }[]>(
        `select data from fs_documents where path = $1 limit 1`,
        [this.path]
      );
      const base = current.length ? current[0].data : {};
      const merged = mergeData(base, encoded);
      await exec`
        insert into fs_documents (path, collection_path, collection_id, data, created_at, updated_at)
        values (${this.path}, ${collPath}, ${collId}, ${exec.json(merged as never)}, now(), now())
        on conflict (path) do update set data = ${exec.json(merged as never)}, updated_at = now()`;
    } else {
      const clean = stripDeletes(encoded);
      await exec`
        insert into fs_documents (path, collection_path, collection_id, data, created_at, updated_at)
        values (${this.path}, ${collPath}, ${collId}, ${exec.json(clean as never)}, now(), now())
        on conflict (path) do update set data = ${exec.json(clean as never)}, updated_at = now()`;
    }
  }

  async update(data: Record<string, unknown>, exec: Exec = getSql()): Promise<void> {
    const encoded = encode(data) as Record<string, unknown>;
    const current = await exec.unsafe<{ data: Record<string, unknown> }[]>(
      `select data from fs_documents where path = $1 limit 1`,
      [this.path]
    );
    if (!current.length) {
      throw new Error(`No document to update: ${this.path}`);
    }
    const merged = mergeData(current[0].data, encoded);
    await exec`update fs_documents set data = ${exec.json(merged as never)}, updated_at = now() where path = ${this.path}`;
  }

  async delete(exec: Exec = getSql()): Promise<void> {
    await exec.unsafe(`delete from fs_documents where path = $1`, [this.path]);
  }
}

// ----------------------------------------------------------------------------
// Query / CollectionReference
// ----------------------------------------------------------------------------
type Filter = { field: string; op: string; value: unknown };
type Order = { field: string; dir: "asc" | "desc" };

export class Query {
  constructor(
    protected readonly target: string, // collection_path, or collection_id when isGroup
    protected readonly filters: Filter[] = [],
    protected readonly orders: Order[] = [],
    protected readonly _limit: number | null = null,
    protected readonly _startAfter: unknown[] | null = null,
    protected readonly isGroup = false
  ) {}

  where(field: string, op: string, value: unknown): Query {
    return new Query(
      this.target,
      [...this.filters, { field, op, value }],
      this.orders,
      this._limit,
      this._startAfter,
      this.isGroup
    );
  }
  orderBy(field: string, dir: "asc" | "desc" = "asc"): Query {
    return new Query(
      this.target,
      this.filters,
      [...this.orders, { field, dir }],
      this._limit,
      this._startAfter,
      this.isGroup
    );
  }
  limit(n: number): Query {
    return new Query(this.target, this.filters, this.orders, n, this._startAfter, this.isGroup);
  }
  /**
   * Firestore-compat projection. Postgres reads the whole `data` JSONB anyway, so
   * we keep the full document — `select(...)` simply returns the same query.
   */
  select(..._fields: string[]): Query {
    return this;
  }
  startAfter(...values: unknown[]): Query {
    // Firestore allows passing a DocumentSnapshot as the cursor. Translate it into
    // the value of the (single) order-by field so the SQL cursor logic still works.
    if (values.length === 1 && values[0] instanceof DocumentSnapshot) {
      const snap = values[0] as DocumentSnapshot;
      const orderField = this.orders[0]?.field;
      const cursorVal = orderField ? snap.get(orderField) : undefined;
      return new Query(
        this.target,
        this.filters,
        this.orders,
        this._limit,
        [cursorVal],
        this.isGroup
      );
    }
    return new Query(this.target, this.filters, this.orders, this._limit, values, this.isGroup);
  }

  /** SQL expression that extracts a (text) value for a field, unwrapping tagged timestamps. */
  protected fieldExpr(field: string): string {
    const f = assertField(field);
    return `coalesce(data#>>'{${f},${TS_TAG}}', data->>'${f}')`;
  }

  async get(exec: Exec = getSql()): Promise<QuerySnapshot> {
    const where: string[] = [];
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };

    if (this.isGroup) {
      where.push(`collection_id = ${p(this.target)}`);
    } else {
      where.push(`collection_path = ${p(this.target)}`);
    }

    for (const f of this.filters) {
      const expr = this.fieldExpr(f.field);
      const safe = assertField(f.field);
      switch (f.op) {
        case "==": {
          if (f.value === null) {
            where.push(`(NOT (data ? '${safe}') OR data->>'${safe}' IS NULL)`);
          } else {
            const { text } = comparableValue(f.value);
            where.push(`${expr} = ${p(text)}`);
          }
          break;
        }
        case "!=": {
          const { text } = comparableValue(f.value);
          where.push(`${expr} IS DISTINCT FROM ${p(text)}`);
          break;
        }
        case "<":
        case "<=":
        case ">":
        case ">=": {
          const { text } = comparableValue(f.value);
          where.push(`${expr} ${f.op} ${p(text)}`);
          break;
        }
        case "array-contains": {
          // Build the search array server-side so the value binds as plain text
          // (avoids the driver wrapping a JSON string param as a jsonb scalar).
          where.push(`data->'${safe}' @> jsonb_build_array(${p(scalarText(f.value))}::text)`);
          break;
        }
        case "array-contains-any": {
          const arr = (f.value as unknown[]).map((v) => encode(v));
          where.push(`data->'${safe}' ?| ${p(arr.map((v) => String(v)))}`);
          break;
        }
        case "in": {
          const vals = (f.value as unknown[]).map((v) => comparableValue(v).text);
          where.push(`${expr} = ANY(${p(vals)})`);
          break;
        }
        default:
          throw new Error(`Unsupported query operator: ${f.op}`);
      }
    }

    // startAfter cursor (single order field supported)
    if (this._startAfter && this.orders.length === 1) {
      const ord = this.orders[0];
      const expr = this.fieldExpr(ord.field);
      const { text } = comparableValue(this._startAfter[0]);
      where.push(`${expr} ${ord.dir === "desc" ? "<" : ">"} ${p(text)}`);
    }

    let sqlText = `select path, data from fs_documents where ${where.join(" AND ")}`;
    if (this.orders.length) {
      const orderClauses = this.orders.map(
        (o) => `${this.fieldExpr(o.field)} ${o.dir === "desc" ? "DESC" : "ASC"} NULLS LAST`
      );
      sqlText += ` order by ${orderClauses.join(", ")}`;
    }
    if (this._limit != null) sqlText += ` limit ${Math.max(0, Math.floor(this._limit))}`;

    const rows = await exec.unsafe<{ path: string; data: Record<string, unknown> }[]>(sqlText, params as never[]);
    const docs = rows.map(
      (r) => new QueryDocumentSnapshot(new DocumentReference(r.path), r.data)
    );
    return new QuerySnapshot(docs);
  }
}

export class CollectionReference extends Query {
  constructor(path: string) {
    super(path, [], [], null, null, false);
  }
  get path(): string {
    return this.target;
  }
  get id(): string {
    return lastSegment(this.target);
  }
  doc(id?: string): DocumentReference {
    return new DocumentReference(`${this.target}/${id ?? genId()}`);
  }
  async add(data: Record<string, unknown>): Promise<DocumentReference> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

// ----------------------------------------------------------------------------
// WriteBatch / Transaction
// ----------------------------------------------------------------------------
export class WriteBatch {
  private ops: ((exec: Exec) => Promise<void>)[] = [];
  set(ref: DocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }): WriteBatch {
    this.ops.push((exec) => ref.set(data, options, exec));
    return this;
  }
  update(ref: DocumentReference, data: Record<string, unknown>): WriteBatch {
    this.ops.push((exec) => ref.update(data, exec));
    return this;
  }
  delete(ref: DocumentReference): WriteBatch {
    this.ops.push((exec) => ref.delete(exec));
    return this;
  }
  async commit(): Promise<void> {
    const ops = this.ops;
    await getSql().begin(async (tx) => {
      for (const op of ops) await op(tx as unknown as Exec);
    });
  }
}

export class Transaction {
  constructor(private readonly tx: Exec) {}
  async get(ref: DocumentReference): Promise<DocumentSnapshot> {
    return ref.getForUpdate(this.tx);
  }
  set(ref: DocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }): Transaction {
    // Firestore buffers tx writes; here we apply immediately within the SQL tx.
    void ref.set(data, options, this.tx);
    return this;
  }
  update(ref: DocumentReference, data: Record<string, unknown>): Transaction {
    void ref.update(data, this.tx);
    return this;
  }
  delete(ref: DocumentReference): Transaction {
    void ref.delete(this.tx);
    return this;
  }
}

// ----------------------------------------------------------------------------
// Firestore
// ----------------------------------------------------------------------------
export class Firestore {
  collection(path: string): CollectionReference {
    return new CollectionReference(path);
  }
  doc(path: string): DocumentReference {
    return new DocumentReference(path);
  }
  collectionGroup(collectionId: string): Query {
    return new Query(collectionId, [], [], null, null, true);
  }
  /** Firestore-compat batch fetch of multiple document refs. */
  async getAll(...refs: DocumentReference[]): Promise<DocumentSnapshot[]> {
    return Promise.all(refs.map((ref) => ref.get()));
  }
  batch(): WriteBatch {
    return new WriteBatch();
  }
  async runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return (await getSql().begin(async (sqlTx) => {
      const tx = new Transaction(sqlTx as unknown as Exec);
      return await fn(tx);
    })) as T;
  }
}

let _db: Firestore | null = null;
export function getFirestore(_app?: unknown, _databaseId?: string): Firestore {
  // Multi-database is collapsed to a single Postgres DB for PowerCouple.
  if (!_db) _db = new Firestore();
  return _db;
}

// Type aliases mirroring firebase-admin/firestore so `type Firestore`, `DocumentData`,
// `DocumentReference`, etc. imports keep resolving.
// Firestore-compat: dynamically-typed document fields (matches firebase-admin).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocumentData = { [field: string]: any };
export type { DocumentReference as DocumentReferenceType };

/**
 * Ambient `FirebaseFirestore.*` namespace — firebase-admin declared this globally, and
 * some modules still reference it (e.g. `FirebaseFirestore.Firestore`). Map the names
 * onto the shim's classes so those references keep type-checking.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace FirebaseFirestore {
    type Firestore = import("./firestoreShim").Firestore;
    type DocumentData = Record<string, unknown>;
    type DocumentReference<T = DocumentData> = import("./firestoreShim").DocumentReference<T>;
    type CollectionReference = import("./firestoreShim").CollectionReference;
    type Query = import("./firestoreShim").Query;
    type DocumentSnapshot = import("./firestoreShim").DocumentSnapshot;
    type QueryDocumentSnapshot = import("./firestoreShim").QueryDocumentSnapshot;
    type QuerySnapshot = import("./firestoreShim").QuerySnapshot;
    type WriteBatch = import("./firestoreShim").WriteBatch;
    type Transaction = import("./firestoreShim").Transaction;
    type Timestamp = import("./firestoreShim").Timestamp;
    type FieldValue = import("./firestoreShim").FieldValue;
  }
}
