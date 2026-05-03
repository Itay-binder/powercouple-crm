import { getAdminDb } from "@/lib/firebase/admin";
import type { OpportunityRecord } from "@/lib/opportunities/repo";

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

export type OpportunityWithContactLastLead = OpportunityRecord & {
  contactLastLeadAt: string | null;
};

/** תאריך פעילות אחרונה ברשומת הליד (איש הקשר) — לא שדה lastLeadAt של ההזדמנות */
export async function attachContactLastLeadAt(
  opportunities: OpportunityRecord[]
): Promise<OpportunityWithContactLastLead[]> {
  const uniqueIds = [
    ...new Set(opportunities.map((o) => String(o.contactId ?? "").trim()).filter(Boolean)),
  ];
  const byContact = new Map<string, string | null>();

  if (uniqueIds.length) {
    const db = await getAdminDb();
    const chunkSize = 10;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const refs = chunk.map((id) => db.collection("leads").doc(id));
      const snaps = await db.getAll(...refs);
      for (const snap of snaps) {
        if (!snap.exists) {
          byContact.set(snap.id, null);
          continue;
        }
        const d = (snap.data() ?? {}) as Record<string, unknown>;
        const updatedAt = mapTs(d.updatedAt);
        const createdAt = mapTs(d.createdAt);
        const pick = updatedAt ?? createdAt;
        byContact.set(snap.id, pick ? pick.toISOString() : null);
      }
    }
  }

  return opportunities.map((o) => {
    const cid = String(o.contactId ?? "").trim();
    return {
      ...o,
      contactLastLeadAt: cid ? (byContact.get(cid) ?? null) : null,
    };
  });
}
