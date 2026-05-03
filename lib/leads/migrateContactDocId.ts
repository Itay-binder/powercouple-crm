import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { fallbackTenantDatabaseId, getFirestoreForDatabaseId } from "../firebase/admin";
import { normalizePhone } from "./repo";

function normalizeUniqueKey(raw: string): string {
  return raw.trim().toLowerCase();
}

function replaceInStringArray(arr: unknown, from: string, to: string): string[] | undefined {
  if (!Array.isArray(arr)) return undefined;
  const out = arr.map((x) => (String(x) === from ? to : String(x)));
  return out.some((x, i) => x !== String(arr[i])) ? out : undefined;
}

function patchDriverKeyedMap(
  raw: unknown,
  from: string,
  to: string
): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(o, from)) return undefined;
  const next = { ...o };
  const v = next[from];
  delete next[from];
  if (!Object.prototype.hasOwnProperty.call(next, to)) next[to] = v;
  return next;
}

function movingOrderReferencesContact(data: Record<string, unknown>, from: string): boolean {
  for (const key of [
    "matchedDriverIds",
    "optionalDriverIds",
    "manualDriverIds",
    "excludedDriverIds",
    "sentMatchDriverIds",
  ]) {
    const a = data[key];
    if (Array.isArray(a) && a.some((x) => String(x) === from)) return true;
  }
  for (const key of ["driverMatchFlags", "driverMatchIssues"]) {
    const o = data[key];
    if (o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, from)) return true;
  }
  return false;
}

export type MigrateContactDocIdResult = {
  ok: true;
  fromId: string;
  toId: string;
  dryRun: boolean;
  opportunitiesUpdated: number;
  externalRefsUpdated: number;
  movingOrdersUpdated: number;
  deletedOldDoc: boolean;
};

/**
 * מעביר מסמך leads מ־fromId ל־toId (מזהה מסמך), מעדכן contactId בהזדמנויות,
 * entityId ב־externalRefs, ומזהי מובילים בהזמנות הובלה — batch אחד (אטומי עד 500 פעולות).
 */
export async function migrateContactDocId(params: {
  db: Firestore;
  fromId: string;
  toId: string;
  dryRun?: boolean;
}): Promise<MigrateContactDocIdResult> {
  const fromId = normalizeUniqueKey(params.fromId);
  const toId = normalizeUniqueKey(params.toId);
  const dryRun = params.dryRun === true;
  const db = params.db;

  if (!fromId || !toId) throw new Error("fromId and toId are required");
  if (fromId === toId) {
    return {
      ok: true,
      fromId,
      toId,
      dryRun,
      opportunitiesUpdated: 0,
      externalRefsUpdated: 0,
      movingOrdersUpdated: 0,
      deletedOldDoc: false,
    };
  }

  const fromRef = db.collection("leads").doc(fromId);
  const toRef = db.collection("leads").doc(toId);

  const [fromSnap, toSnap] = await Promise.all([fromRef.get(), toRef.get()]);
  if (!fromSnap.exists) throw new Error(`Contact doc not found: ${fromId}`);
  if (toSnap.exists) throw new Error(`Target doc already exists: ${toId}`);

  const fromData = (fromSnap.data() ?? {}) as Record<string, unknown>;

  const oppsSnap = await db.collection("opportunities").where("contactId", "==", fromId).get();
  const extSnap = await db.collection("externalRefs").where("entityId", "==", fromId).get();
  const ordersSnap = await db.collection("movingOrders").get();
  const orderDocsToPatch = ordersSnap.docs.filter((d) =>
    movingOrderReferencesContact((d.data() ?? {}) as Record<string, unknown>, fromId)
  );

  if (dryRun) {
    return {
      ok: true,
      fromId,
      toId,
      dryRun: true,
      opportunitiesUpdated: oppsSnap.size,
      externalRefsUpdated: extSnap.size,
      movingOrdersUpdated: orderDocsToPatch.length,
      deletedOldDoc: false,
    };
  }

  const totalWrites = 1 + oppsSnap.size + extSnap.size + orderDocsToPatch.length + 1;
  if (totalWrites > 500) {
    throw new Error(
      `Migration needs ${totalWrites} writes (Firestore batch max 500). Reduce linked data or run a custom migration.`
    );
  }

  const leadPayload = { ...fromData };
  if (typeof leadPayload.phone === "string" && leadPayload.phone.trim()) {
    const n = normalizePhone(leadPayload.phone);
    if (n) leadPayload.phone = n;
  }

  const batch = db.batch();
  batch.set(toRef, { ...leadPayload, updatedAt: FieldValue.serverTimestamp() });

  for (const d of oppsSnap.docs) {
    batch.update(d.ref, { contactId: toId, updatedAt: FieldValue.serverTimestamp() });
  }
  for (const d of extSnap.docs) {
    batch.update(d.ref, { entityId: toId, updatedAt: FieldValue.serverTimestamp() });
  }

  for (const d of orderDocsToPatch) {
    const data = (d.data() ?? {}) as Record<string, unknown>;
    const upd: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    const m = replaceInStringArray(data.matchedDriverIds, fromId, toId);
    const o = replaceInStringArray(data.optionalDriverIds, fromId, toId);
    const man = replaceInStringArray(data.manualDriverIds, fromId, toId);
    const ex = replaceInStringArray(data.excludedDriverIds, fromId, toId);
    const sent = replaceInStringArray(data.sentMatchDriverIds, fromId, toId);
    if (m) upd.matchedDriverIds = m;
    if (o) upd.optionalDriverIds = o;
    if (man) upd.manualDriverIds = man;
    if (ex) upd.excludedDriverIds = ex;
    if (sent) upd.sentMatchDriverIds = sent;
    const flags = patchDriverKeyedMap(data.driverMatchFlags, fromId, toId);
    const issues = patchDriverKeyedMap(data.driverMatchIssues, fromId, toId);
    if (flags) upd.driverMatchFlags = flags;
    if (issues) upd.driverMatchIssues = issues;
    batch.update(d.ref, upd);
  }

  batch.delete(fromRef);
  await batch.commit();

  return {
    ok: true,
    fromId,
    toId,
    dryRun: false,
    opportunitiesUpdated: oppsSnap.size,
    externalRefsUpdated: extSnap.size,
    movingOrdersUpdated: orderDocsToPatch.length,
    deletedOldDoc: true,
  };
}

export async function resolveMigrateContactParams(input: {
  databaseId?: string;
  fromContactId?: string;
  matchName?: string;
}): Promise<{ db: Firestore; fromId: string; toId: string }> {
  const dbId = (input.databaseId ?? "").trim() || fallbackTenantDatabaseId();
  const db = getFirestoreForDatabaseId(dbId);

  let fromId = (input.fromContactId ?? "").trim();
  if (!fromId && input.matchName?.trim()) {
    const name = input.matchName.trim();
    const snap = await db.collection("leads").where("name", "==", name).limit(5).get();
    if (snap.empty) throw new Error(`No lead found with name: ${name}`);
    if (snap.size > 1) throw new Error(`Multiple leads with name "${name}" (${snap.size}); pass fromContactId`);
    fromId = snap.docs[0].id;
  }
  if (!fromId) throw new Error("fromContactId or matchName is required");

  const fromSnap = await db.collection("leads").doc(normalizeUniqueKey(fromId)).get();
  if (!fromSnap.exists) throw new Error(`Contact not found: ${fromId}`);
  const data = (fromSnap.data() ?? {}) as Record<string, unknown>;
  const phoneRaw = typeof data.phone === "string" ? data.phone : "";
  const phone = normalizePhone(phoneRaw);
  if (!phone) throw new Error("Contact has no normalizable phone; set phone on the lead first");
  const toId = normalizeUniqueKey(phone);

  return { db, fromId: fromSnap.id, toId };
}
