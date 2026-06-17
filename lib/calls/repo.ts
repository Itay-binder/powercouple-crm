import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { appendLeadNote, getLeadById } from "@/lib/leads/repo";
import {
  deleteSalesCallCalendarEventIfAny,
  reconcileSalesCallGoogleCalendar,
} from "@/lib/googleCalendar/salesCallSync";
import { getGoogleCalendarTokensForTenant } from "@/lib/googleCalendar/tokensRepo";
import { getTeamMemberById } from "@/lib/team/repo";

export type SalesCallStatus = "pending" | "done" | "canceled";

export type SalesCallRecord = {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  repId: string;
  repName: string;
  note: string;
  /** כותרת אופציונלית לתצוגה / לוח שנה */
  title?: string;
  scheduledAt: string | null;
  status: SalesCallStatus;
  followUpOfId?: string | null;
  followUpId?: string | null;
  completedAt: string | null;
  completionNote?: string;
  syncToGoogleCalendar?: boolean;
  googleCalendarId?: string;
  googleEventId?: string;
  createdAt: string | null;
  updatedAt: string | null;
};

const COLLECTION = "salesCalls";
const NOTE_AUTHOR = "ניהול שיחות";

function tsToIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof (v as { toDate?: () => Date }).toDate === "function") {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function mapDoc(id: string, data: Record<string, unknown>): SalesCallRecord {
  return {
    id,
    contactId: typeof data.contactId === "string" ? data.contactId : "",
    contactName: typeof data.contactName === "string" ? data.contactName : "",
    contactPhone: typeof data.contactPhone === "string" ? data.contactPhone : "",
    repId: typeof data.repId === "string" ? data.repId : "",
    repName: typeof data.repName === "string" ? data.repName : "",
    note: typeof data.note === "string" ? data.note : "",
    title: typeof data.title === "string" ? data.title : undefined,
    scheduledAt: tsToIso(data.scheduledAt),
    status:
      data.status === "done" || data.status === "canceled" ? data.status : "pending",
    followUpOfId: typeof data.followUpOfId === "string" ? data.followUpOfId : null,
    followUpId: typeof data.followUpId === "string" ? data.followUpId : null,
    completedAt: tsToIso(data.completedAt),
    completionNote: typeof data.completionNote === "string" ? data.completionNote : "",
    syncToGoogleCalendar: data.syncToGoogleCalendar === true,
    googleCalendarId: typeof data.googleCalendarId === "string" ? data.googleCalendarId : undefined,
    googleEventId: typeof data.googleEventId === "string" ? data.googleEventId : undefined,
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
}

export async function listSalesCalls(filter?: {
  repId?: string;
  status?: SalesCallStatus;
}): Promise<SalesCallRecord[]> {
  const db = await getAdminDb();
  const snap = await db.collection(COLLECTION).get();
  const out: SalesCallRecord[] = [];
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const rec = mapDoc(doc.id, data);
    if (filter?.repId && rec.repId !== filter.repId) continue;
    if (filter?.status && rec.status !== filter.status) continue;
    out.push(rec);
  }
  return out.sort((a, b) => {
    const ta = a.scheduledAt ?? a.createdAt ?? "";
    const tb = b.scheduledAt ?? b.createdAt ?? "";
    if (ta && tb) return tb.localeCompare(ta);
    if (ta) return -1;
    if (tb) return 1;
    return 0;
  });
}

export async function getSalesCallById(id: string): Promise<SalesCallRecord | null> {
  const db = await getAdminDb();
  const ref = db.collection(COLLECTION).doc(id.trim());
  const snap = await ref.get();
  if (!snap.exists) return null;
  return mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

function fmtIsoForNote(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function createSalesCall(input: {
  contactId: string;
  repId: string;
  title?: string;
  note?: string;
  scheduledAt?: string;
  followUpOfId?: string;
  syncToGoogleCalendar?: boolean;
  googleCalendarId?: string;
}): Promise<SalesCallRecord> {
  const contactId = String(input.contactId ?? "").trim();
  if (!contactId) throw new Error("יש לבחור איש קשר");
  const repId = String(input.repId ?? "").trim();
  if (!repId) throw new Error("יש לבחור נציג מהצוות");

  const contact = await getLeadById(contactId);
  if (!contact) throw new Error("איש הקשר לא נמצא");
  const rep = await getTeamMemberById(repId);
  if (!rep) throw new Error("איש הצוות לא נמצא");

  const titleText = String(input.title ?? "").trim();
  const noteText = String(input.note ?? "").trim();
  const scheduledIso = String(input.scheduledAt ?? "").trim();

  const wantsCal =
    Boolean(input.syncToGoogleCalendar) &&
    Boolean(String(input.googleCalendarId ?? "").trim()) &&
    Boolean(scheduledIso);
  if (wantsCal) {
    const stored = await getGoogleCalendarTokensForTenant();
    if (!stored) {
      throw new Error(
        "Google Calendar is not connected. Connect under Calendar in the CRM menu."
      );
    }
  }

  const db = await getAdminDb();
  const ref = db.collection(COLLECTION).doc();
  const payload: Record<string, unknown> = {
    contactId,
    contactName: contact.name ?? "",
    contactPhone: contact.phone ?? "",
    repId,
    repName: rep.name,
    note: noteText,
    status: "pending" as SalesCallStatus,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (titleText) payload.title = titleText;
  if (scheduledIso) {
    payload.scheduledAt = Timestamp.fromDate(new Date(scheduledIso));
  }
  if (input.followUpOfId?.trim()) {
    payload.followUpOfId = input.followUpOfId.trim();
  }
  await ref.set(payload);

  if (input.followUpOfId?.trim()) {
    await db
      .collection(COLLECTION)
      .doc(input.followUpOfId.trim())
      .set({ followUpId: ref.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  let snap = await ref.get();
  let rec = mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  if (wantsCal) {
    try {
      const calPatch = await reconcileSalesCallGoogleCalendar(null, rec, {
        syncToGoogleCalendar: input.syncToGoogleCalendar,
        googleCalendarId: input.googleCalendarId,
      });
      await ref.set(
        { ...calPatch, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (e) {
      console.error("[salesCalls] calendar sync on create failed", e);
    }
  }

  const isFollowUp = Boolean(input.followUpOfId?.trim());
  const noteHeading = isFollowUp ? "פולואפ שיחה נקבע" : "שיחה חדשה נקבעה";
  const lines = [
    `${noteHeading}`,
    `נציג: ${rep.name}${rep.role ? ` (${rep.role})` : ""}`,
    `תאריך לביצוע: ${scheduledIso ? fmtIsoForNote(scheduledIso) : "—"}`,
    noteText ? `הערה: ${noteText}` : null,
  ].filter(Boolean);
  try {
    await appendLeadNote(contactId, {
      text: lines.join("\n"),
      createdBy: NOTE_AUTHOR,
    });
  } catch {
    /* note sync best-effort */
  }

  snap = await ref.get();
  return mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function updateSalesCall(
  id: string,
  input: {
    title?: string;
    note?: string;
    scheduledAt?: string;
    repId?: string;
    status?: SalesCallStatus;
    completionNote?: string;
    syncToGoogleCalendar?: boolean;
    googleCalendarId?: string;
  }
): Promise<SalesCallRecord> {
  const callId = id.trim();
  if (!callId) throw new Error("שיחה לא נמצאה");
  const db = await getAdminDb();
  const ref = db.collection(COLLECTION).doc(callId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("שיחה לא נמצאה");
  const prev = mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);

  const nextScheduled =
    input.scheduledAt !== undefined
      ? String(input.scheduledAt).trim()
      : (prev.scheduledAt ?? "");
  const nextStatus = input.status ?? prev.status;
  const syncIntent =
    input.syncToGoogleCalendar !== undefined
      ? Boolean(input.syncToGoogleCalendar)
      : Boolean(prev.syncToGoogleCalendar);
  const calIdMerge = String(input.googleCalendarId ?? prev.googleCalendarId ?? "").trim();

  const willNeedGoogle =
    syncIntent &&
    Boolean(calIdMerge) &&
    Boolean(nextScheduled) &&
    nextStatus === "pending";

  if (willNeedGoogle) {
    const stored = await getGoogleCalendarTokensForTenant();
    if (!stored) {
      throw new Error(
        "Google Calendar is not connected. Connect under Calendar in the CRM menu."
      );
    }
  }

  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (t) payload.title = t;
    else payload.title = FieldValue.delete();
  }
  if (input.note !== undefined) payload.note = input.note.trim();
  if (input.scheduledAt !== undefined) {
    const s = input.scheduledAt.trim();
    if (s) payload.scheduledAt = Timestamp.fromDate(new Date(s));
    else payload.scheduledAt = FieldValue.delete();
  }
  if (input.repId !== undefined && input.repId.trim()) {
    const rep = await getTeamMemberById(input.repId.trim());
    if (!rep) throw new Error("איש הצוות לא נמצא");
    payload.repId = rep.id;
    payload.repName = rep.name;
  }
  if (input.status !== undefined) {
    payload.status = input.status;
    if (input.status === "done") {
      payload.completedAt = FieldValue.serverTimestamp();
      if (input.completionNote !== undefined) {
        payload.completionNote = input.completionNote.trim();
      }
    }
  } else if (input.completionNote !== undefined) {
    payload.completionNote = input.completionNote.trim();
  }

  await ref.set(payload, { merge: true });
  let after = await ref.get();
  let next = mapDoc(after.id, (after.data() ?? {}) as Record<string, unknown>);

  const hasPrevEvent = Boolean(String(prev.googleEventId ?? "").trim());
  const userTouchesCal = input.syncToGoogleCalendar !== undefined;
  if (hasPrevEvent || userTouchesCal || willNeedGoogle) {
    try {
      const calPatch = await reconcileSalesCallGoogleCalendar(prev, next, {
        syncToGoogleCalendar: input.syncToGoogleCalendar,
        googleCalendarId: input.googleCalendarId,
      });
      await ref.set(
        { ...calPatch, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      after = await ref.get();
      next = mapDoc(after.id, (after.data() ?? {}) as Record<string, unknown>);
    } catch (e) {
      console.error("[salesCalls] calendar sync on update failed", e);
    }
  }

  // Append summary note when call is closed.
  if (
    prev.status !== "done" &&
    next.status === "done" &&
    next.contactId
  ) {
    const lines = [
      `שיחה בוצעה`,
      `נציג: ${next.repName}`,
      `תאריך לביצוע: ${fmtIsoForNote(next.scheduledAt)}`,
      next.completionNote ? `סיכום: ${next.completionNote}` : null,
      next.note ? `הערה ראשונית: ${next.note}` : null,
    ].filter(Boolean);
    try {
      await appendLeadNote(next.contactId, {
        text: lines.join("\n"),
        createdBy: NOTE_AUTHOR,
      });
    } catch {
      /* best-effort */
    }
  }

  return next;
}

export async function deleteSalesCall(id: string): Promise<void> {
  const db = await getAdminDb();
  const ref = db.collection(COLLECTION).doc(id.trim());
  const snap = await ref.get();
  if (snap.exists) {
    const prev = mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    await deleteSalesCallCalendarEventIfAny(prev);
  }
  await ref.delete();
}
