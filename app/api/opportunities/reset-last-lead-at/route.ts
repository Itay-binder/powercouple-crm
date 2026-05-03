import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** איפוס גורף לשדה lastLeadAt על כל ההזדמנויות. */
export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const confirm = req.nextUrl.searchParams.get("confirm");
  if (confirm !== "yes") {
    return NextResponse.json(
      { ok: false, error: "יש לשלוח confirm=yes בשאילתה" },
      { status: 400 }
    );
  }

  const db = await getAdminDb();
  const snap = await db.collection("opportunities").get();
  const batchSize = 400;
  let updated = 0;
  let batch = db.batch();
  let inBatch = 0;

  for (const doc of snap.docs) {
    batch.update(doc.ref, { lastLeadAt: FieldValue.delete() });
    updated += 1;
    inBatch += 1;
    if (inBatch >= batchSize) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await batch.commit();

  return NextResponse.json({ ok: true, updated });
}
