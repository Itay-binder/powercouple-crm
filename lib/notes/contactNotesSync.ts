import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type NoteAttachmentMeta = { id: string; fileName: string; url: string };

export type SyncedNote = {
  id: string;
  text: string;
  createdAt: string;
  createdBy?: string;
  /** קטגוריית הערה (מסך לקוח, פייפליין וכו׳) */
  category?: string;
  attachments?: NoteAttachmentMeta[];
};

function parseAttachments(v: unknown): NoteAttachmentMeta[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: NoteAttachmentMeta[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const fileName = typeof o.fileName === "string" ? o.fileName : "";
    const url = typeof o.url === "string" ? o.url : "";
    if (id && fileName && url) out.push({ id, fileName, url });
  }
  return out.length ? out : undefined;
}

function mergeAttachments(
  a?: NoteAttachmentMeta[],
  b?: NoteAttachmentMeta[]
): NoteAttachmentMeta[] | undefined {
  const merged = [...(a ?? []), ...(b ?? [])];
  const seen = new Set<string>();
  const out: NoteAttachmentMeta[] = [];
  for (const x of merged) {
    const k = `${x.id}|${x.url}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out.length ? out : undefined;
}

function collectNotes(into: Map<string, SyncedNote>, arr: unknown) {
  if (!Array.isArray(arr)) return;
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const text = typeof o.text === "string" ? o.text : "";
    const createdAt = typeof o.createdAt === "string" ? o.createdAt : "";
    if (!id || !createdAt) continue;
    const createdBy = typeof o.createdBy === "string" ? o.createdBy : undefined;
    const category = typeof o.category === "string" && o.category.trim() ? o.category.trim() : undefined;
    const attachments = parseAttachments(o.attachments);
    const next: SyncedNote = {
      id,
      text,
      createdAt,
      ...(createdBy ? { createdBy } : {}),
      ...(category ? { category } : {}),
      ...(attachments ? { attachments } : {}),
    };
    const prev = into.get(id);
    if (!prev) {
      into.set(id, next);
      continue;
    }
    const mergedAtt = mergeAttachments(prev.attachments, next.attachments);
    const mergedCategory = next.category ?? prev.category;
    into.set(id, {
      ...prev,
      ...next,
      text: next.text || prev.text,
      ...(mergedCategory ? { category: mergedCategory } : {}),
      ...(mergedAtt ? { attachments: mergedAtt } : {}),
    });
  }
}

/**
 * Unifies notes from the contact and all opportunities for that contact, then
 * writes the merged list to the lead and every opportunity (by note id).
 */
export async function reconcileContactNotesAcrossEntities(contactId: string): Promise<void> {
  const cid = contactId.trim();
  if (!cid) return;

  const db = await getAdminDb();
  const contactRef = db.collection("leads").doc(cid);
  const [contactSnap, oppsSnap] = await Promise.all([
    contactRef.get(),
    db.collection("opportunities").where("contactId", "==", cid).get(),
  ]);

  if (!contactSnap.exists && oppsSnap.empty) return;

  const map = new Map<string, SyncedNote>();
  if (contactSnap.exists) {
    collectNotes(map, (contactSnap.data() as Record<string, unknown>).notes);
  }
  for (const doc of oppsSnap.docs) {
    collectNotes(map, (doc.data() as Record<string, unknown>).notes);
  }

  const merged = Array.from(map.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ts = FieldValue.serverTimestamp();

  if (contactSnap.exists) {
    await contactRef.set({ notes: merged, updatedAt: ts }, { merge: true });
  }

  const MAX = 400;
  let batch = db.batch();
  let n = 0;
  for (const doc of oppsSnap.docs) {
    batch.set(doc.ref, { notes: merged, updatedAt: ts }, { merge: true });
    n++;
    if (n >= MAX) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

/**
 * Writes the exact note list to every opportunity for this contact (contact doc
 * should already be updated). Use when the user replaces notes on the contact so
 * deletions are not resurrected from stale opportunity copies.
 */
export async function propagateExactNotesToAllOpportunities(
  contactId: string,
  notes: SyncedNote[]
): Promise<void> {
  const cid = contactId.trim();
  if (!cid) return;

  const db = await getAdminDb();
  const oppsSnap = await db.collection("opportunities").where("contactId", "==", cid).get();
  if (oppsSnap.empty) return;

  const ts = FieldValue.serverTimestamp();
  const MAX = 400;
  let batch = db.batch();
  let n = 0;
  for (const doc of oppsSnap.docs) {
    batch.set(doc.ref, { notes, updatedAt: ts }, { merge: true });
    n++;
    if (n >= MAX) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}
