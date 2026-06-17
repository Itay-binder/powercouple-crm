#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as admin from "firebase-admin";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from project root (two levels up from dist/)
loadDotenv({ path: resolve(__dirname, "../../.env.local"), override: false });

// --- Firebase ---

function parseServiceAccountJson(raw: string): Record<string, unknown> {
  const direct = raw.trim();
  try {
    return JSON.parse(direct) as Record<string, unknown>;
  } catch {
    const patched = direct.replace(
      /"private_key"\s*:\s*"([\s\S]*?)"\s*,\s*"client_email"/,
      (_m: string, pk: string) => {
        const escaped = pk
          .replace(/\\/g, "\\\\")
          .replace(/\r?\n/g, "\\n")
          .replace(/"/g, '\\"');
        return `"private_key":"${escaped}","client_email"`;
      }
    );
    return JSON.parse(patched) as Record<string, unknown>;
  }
}

let _db: admin.firestore.Firestore | null = null;

function getDb(): admin.firestore.Firestore {
  if (_db) return _db;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON in .env.local");

  const cred = parseServiceAccountJson(raw);
  if (typeof cred.private_key === "string") {
    cred.private_key = (cred.private_key as string).replace(/\\n/g, "\n");
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(cred as admin.ServiceAccount) });
  }

  let databaseId = "(default)";
  const tenantsRaw = process.env.CRM_TENANTS?.trim();
  if (tenantsRaw) {
    try {
      const tenants = JSON.parse(tenantsRaw) as Array<{ id?: string; databaseId?: string }>;
      const defaultId = process.env.CRM_DEFAULT_TENANT_ID?.trim();
      const tenant = defaultId ? tenants.find((t) => t.id === defaultId) : tenants[0];
      if (tenant?.databaseId?.trim()) databaseId = tenant.databaseId.trim();
    } catch { /* ignore */ }
  }
  if (databaseId === "(default)") {
    const envDbId = process.env.FIRESTORE_DATABASE_ID?.trim();
    if (envDbId) databaseId = envDbId;
  }

  _db = databaseId === "(default)"
    ? getFirestore()
    : getFirestore(admin.app(), databaseId);

  return _db;
}

// --- Helpers ---

type PlainDoc = Record<string, unknown>;

function serializeDoc(doc: admin.firestore.DocumentSnapshot): PlainDoc {
  const data = doc.data() ?? {};
  const result: PlainDoc = { id: doc.id };
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Timestamp) {
      result[k] = v.toDate().toISOString();
    } else if (Array.isArray(v)) {
      result[k] = v.map((i) => (i instanceof Timestamp ? i.toDate().toISOString() : i));
    } else if (v && typeof v === "object" && !(v instanceof Date)) {
      // Nested objects — recurse one level for common sub-fields
      const sub: Record<string, unknown> = {};
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        sub[sk] = sv instanceof Timestamp ? sv.toDate().toISOString() : sv;
      }
      result[k] = sub;
    } else {
      result[k] = v;
    }
  }
  return result;
}

function ok(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
}

// --- Tools schema ---

const TOOLS = [
  {
    name: "list_leads",
    description: "רשימת לידים מה-CRM. ניתן לסנן לפי שלב, פייפליין, נציג ומגבלת כמות.",
    inputSchema: {
      type: "object",
      properties: {
        stage: { type: "string", description: "שם שלב (אופציונלי)" },
        pipelineId: { type: "string", description: "מזהה פייפליין (אופציונלי)" },
        assignedRep: { type: "string", description: "שם נציג (אופציונלי)" },
        limit: { type: "number", description: "כמות מקסימלית, עד 50 (ברירת מחדל: 20)" },
      },
    },
  },
  {
    name: "get_lead",
    description: "קבלת ליד ספציפי לפי טלפון, אימייל, או מזהה.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "מזהה ייחודי (document ID)" },
        phone: { type: "string", description: "מספר טלפון" },
        email: { type: "string", description: "אימייל" },
      },
    },
  },
  {
    name: "search_leads",
    description: "חיפוש לידים לפי שם, טלפון, או אימייל.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "טקסט חיפוש" },
        limit: { type: "number", description: "כמות תוצאות (ברירת מחדל: 10)" },
      },
    },
  },
  {
    name: "list_moving_orders",
    description: "רשימת הזמנות הובלה. ניתן לסנן לפי שלב וסטטוס.",
    inputSchema: {
      type: "object",
      properties: {
        stage: { type: "string", description: "שלב (אופציונלי)" },
        status: {
          type: "string",
          enum: ["pending", "dispatched", "completed", "cancelled", "rejected"],
          description: "סטטוס (אופציונלי)",
        },
        limit: { type: "number", description: "כמות (ברירת מחדל: 20)" },
      },
    },
  },
  {
    name: "get_moving_order",
    description: "קבלת הזמנת הובלה ספציפית לפי מזהה.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "orderId או document ID" },
      },
    },
  },
  {
    name: "list_recent_activity",
    description: "פעילות אחרונה ב-CRM — לידים והזמנות שנוצרו לאחרונה.",
    inputSchema: {
      type: "object",
      properties: {
        hours: { type: "number", description: "כמה שעות אחורה (ברירת מחדל: 24)" },
        limit: { type: "number", description: "כמות לכל סוג (ברירת מחדל: 15)" },
      },
    },
  },
  {
    name: "list_opportunities",
    description: "רשימת הזדמנויות מכירה.",
    inputSchema: {
      type: "object",
      properties: {
        stage: { type: "string" },
        pipelineId: { type: "string" },
        contactId: { type: "string", description: "מזהה ליד" },
        limit: { type: "number", description: "כמות (ברירת מחדל: 20)" },
      },
    },
  },
  {
    name: "list_whatsapp_chats",
    description: "רשימת שיחות WhatsApp האחרונות.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "כמות שיחות (ברירת מחדל: 20)" },
      },
    },
  },
  {
    name: "get_whatsapp_thread",
    description: "היסטוריית הודעות WhatsApp עם מספר טלפון ספציפי.",
    inputSchema: {
      type: "object",
      required: ["phone"],
      properties: {
        phone: { type: "string", description: "מספר טלפון" },
        limit: { type: "number", description: "כמות הודעות (ברירת מחדל: 30)" },
      },
    },
  },
  {
    name: "update_lead",
    description: "עדכון שדות ליד (שם, שלב, נציג, סטטוס וכו').",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "מזהה הליד" },
        name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        stage: { type: "string" },
        assignedRep: { type: "string" },
        status: { type: "string", enum: ["פתוח", "זכיה", "הפסד"] },
        pipelineId: { type: "string" },
        source: { type: "string" },
      },
    },
  },
  {
    name: "add_lead_note",
    description: "הוספת הערה לליד.",
    inputSchema: {
      type: "object",
      required: ["id", "text"],
      properties: {
        id: { type: "string", description: "מזהה הליד" },
        text: { type: "string", description: "תוכן ההערה" },
      },
    },
  },
  {
    name: "update_moving_order",
    description: "עדכון הזמנת הובלה (שלב, סטטוס).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "מזהה ההזמנה" },
        stage: { type: "string" },
        status: { type: "string", enum: ["pending", "dispatched", "completed", "cancelled", "rejected"] },
      },
    },
  },
];

// --- Handlers ---

type Args = Record<string, unknown>;

async function listLeads(a: Args): Promise<PlainDoc[]> {
  const db = getDb();
  const limit = Math.min(Number(a.limit) || 20, 50);
  let q: admin.firestore.Query = db.collection("leads").orderBy("createdAt", "desc").limit(limit);
  if (a.stage) q = q.where("stage", "==", String(a.stage));
  if (a.pipelineId) q = q.where("pipelineId", "==", String(a.pipelineId));
  if (a.assignedRep) q = q.where("assignedRep", "==", String(a.assignedRep));
  const snap = await q.get();
  return snap.docs.map(serializeDoc);
}

async function getLead(a: Args): Promise<PlainDoc | null> {
  const db = getDb();
  if (a.id) {
    const doc = await db.collection("leads").doc(String(a.id)).get();
    if (doc.exists) return serializeDoc(doc);
  }
  if (a.phone) {
    const normalized = normalizePhone(String(a.phone));
    const doc = await db.collection("leads").doc(normalized).get();
    if (doc.exists) return serializeDoc(doc);
    const snap = await db.collection("leads").where("phone", "==", String(a.phone)).limit(1).get();
    if (!snap.empty) return serializeDoc(snap.docs[0]);
  }
  if (a.email) {
    const email = String(a.email).toLowerCase().trim();
    const snap = await db.collection("leads").where("email", "==", email).limit(1).get();
    if (!snap.empty) return serializeDoc(snap.docs[0]);
    // Try normalized document ID format
    const normalized = email.replace(/[@.]/g, "_");
    const doc = await db.collection("leads").doc(normalized).get();
    if (doc.exists) return serializeDoc(doc);
  }
  return null;
}

async function searchLeads(a: Args): Promise<PlainDoc[]> {
  const db = getDb();
  const query = String(a.query || "").trim();
  const limit = Math.min(Number(a.limit) || 10, 30);
  const results: admin.firestore.DocumentSnapshot[] = [];
  const seen = new Set<string>();

  const push = (docs: admin.firestore.DocumentSnapshot[]) => {
    for (const d of docs) {
      if (!seen.has(d.id)) { seen.add(d.id); results.push(d); }
    }
  };

  // Phone search
  if (/\d{4,}/.test(query)) {
    const normalized = normalizePhone(query);
    const s = await db.collection("leads")
      .where("phone", ">=", normalized)
      .where("phone", "<=", normalized + "")
      .limit(5).get();
    push(s.docs);
  }

  // Name prefix search
  const nameSnap = await db.collection("leads")
    .where("name", ">=", query)
    .where("name", "<=", query + "")
    .limit(15).get();
  push(nameSnap.docs);

  return results.slice(0, limit).map(serializeDoc);
}

async function listMovingOrders(a: Args): Promise<PlainDoc[]> {
  const db = getDb();
  const limit = Math.min(Number(a.limit) || 20, 50);
  let q: admin.firestore.Query = db.collection("movingOrders").orderBy("createdAt", "desc").limit(limit);
  if (a.stage) q = q.where("stage", "==", String(a.stage));
  if (a.status) q = q.where("status", "==", String(a.status));
  const snap = await q.get();
  return snap.docs.map(serializeDoc);
}

async function getMovingOrder(a: Args): Promise<PlainDoc | null> {
  const db = getDb();
  const id = String(a.id);
  const doc = await db.collection("movingOrders").doc(id).get();
  if (doc.exists) return serializeDoc(doc);
  const snap = await db.collection("movingOrders").where("orderId", "==", id).limit(1).get();
  if (!snap.empty) return serializeDoc(snap.docs[0]);
  return null;
}

async function listRecentActivity(a: Args): Promise<unknown> {
  const db = getDb();
  const hours = Number(a.hours) || 24;
  const limit = Math.min(Number(a.limit) || 15, 30);
  const since = Timestamp.fromDate(new Date(Date.now() - hours * 3_600_000));

  const [leadsSnap, ordersSnap] = await Promise.all([
    db.collection("leads").where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(limit).get(),
    db.collection("movingOrders").where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(limit).get(),
  ]);

  return {
    period: `${hours} שעות אחרונות`,
    leadsCount: leadsSnap.size,
    movingOrdersCount: ordersSnap.size,
    leads: leadsSnap.docs.map(serializeDoc),
    movingOrders: ordersSnap.docs.map(serializeDoc),
  };
}

async function listOpportunities(a: Args): Promise<PlainDoc[]> {
  const db = getDb();
  const limit = Math.min(Number(a.limit) || 20, 50);
  let q: admin.firestore.Query = db.collection("opportunities").orderBy("createdAt", "desc").limit(limit);
  if (a.stage) q = q.where("stage", "==", String(a.stage));
  if (a.pipelineId) q = q.where("pipelineId", "==", String(a.pipelineId));
  if (a.contactId) q = q.where("contactId", "==", String(a.contactId));
  const snap = await q.get();
  return snap.docs.map(serializeDoc);
}

async function listWhatsappChats(a: Args): Promise<PlainDoc[]> {
  const db = getDb();
  const limit = Math.min(Number(a.limit) || 20, 50);
  const snap = await db.collection("whatsappChats").orderBy("lastMessageAt", "desc").limit(limit).get();
  return snap.docs.map(serializeDoc);
}

async function getWhatsappThread(a: Args): Promise<unknown> {
  const db = getDb();
  const phone = normalizePhone(String(a.phone));
  const limit = Math.min(Number(a.limit) || 30, 100);
  const [chatDoc, messagesSnap] = await Promise.all([
    db.collection("whatsappChats").doc(phone).get(),
    db.collection("whatsappChats").doc(phone).collection("thread_messages")
      .orderBy("timestamp", "desc").limit(limit).get(),
  ]);
  return {
    chat: chatDoc.exists ? serializeDoc(chatDoc) : null,
    messages: messagesSnap.docs.map(serializeDoc).reverse(),
  };
}

async function updateLead(a: Args): Promise<unknown> {
  const db = getDb();
  const id = String(a.id);
  const fields: Record<string, unknown> = {};
  for (const f of ["name", "phone", "email", "stage", "assignedRep", "status", "pipelineId", "source"]) {
    if (a[f] !== undefined) fields[f] = a[f];
  }
  fields.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.collection("leads").doc(id).update(fields);
  return { updated: true, id };
}

async function addLeadNote(a: Args): Promise<unknown> {
  const db = getDb();
  const id = String(a.id);
  const note = {
    id: crypto.randomUUID(),
    text: String(a.text),
    createdAt: new Date().toISOString(),
    createdBy: "Claude",
  };
  await db.collection("leads").doc(id).update({
    notes: admin.firestore.FieldValue.arrayUnion(note),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { added: true, note };
}

async function updateMovingOrder(a: Args): Promise<unknown> {
  const db = getDb();
  const id = String(a.id);
  const fields: Record<string, unknown> = {};
  if (a.stage !== undefined) fields.stage = a.stage;
  if (a.status !== undefined) fields.status = a.status;
  fields.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.collection("movingOrders").doc(id).update(fields);
  return { updated: true, id };
}

// --- Server ---

const server = new Server(
  { name: "liftygo-crm", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Args;
  try {
    let result: unknown;
    switch (name) {
      case "list_leads":           result = await listLeads(a); break;
      case "get_lead":             result = await getLead(a); break;
      case "search_leads":         result = await searchLeads(a); break;
      case "list_moving_orders":   result = await listMovingOrders(a); break;
      case "get_moving_order":     result = await getMovingOrder(a); break;
      case "list_recent_activity": result = await listRecentActivity(a); break;
      case "list_opportunities":   result = await listOpportunities(a); break;
      case "list_whatsapp_chats":  result = await listWhatsappChats(a); break;
      case "get_whatsapp_thread":  result = await getWhatsappThread(a); break;
      case "update_lead":          result = await updateLead(a); break;
      case "add_lead_note":        result = await addLeadNote(a); break;
      case "update_moving_order":  result = await updateMovingOrder(a); break;
      default:
        return {
          content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
    return ok(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `שגיאה: ${msg}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
