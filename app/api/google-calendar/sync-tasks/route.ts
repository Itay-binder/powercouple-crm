import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listUnifiedTasks } from "@/lib/tasks/repo";
import { reconcileTasksGoogleCalendar } from "@/lib/googleCalendar/taskSync";
import { getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import type { RawTaskIn } from "@/lib/tasks/merge";

export const dynamic = "force-dynamic";

async function persistTasksForEntity(
  col: "leads" | "opportunities",
  entityId: string,
  nextTasks: RawTaskIn[]
) {
  const db = await getAdminDb();
  await db.collection(col).doc(entityId).set(
    {
      tasks: nextTasks,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const tasks = await listUnifiedTasks();
    const toSync = tasks.filter(
      (t) =>
        t.syncToGoogleCalendar &&
        String(t.googleCalendarId ?? "").trim() &&
        String(t.dueAt ?? "").trim()
    );
    let ok = 0;
    const errors: string[] = [];
    const db = await getAdminDb();
    for (const t of toSync) {
      try {
        const col = t.entityType === "contact" ? "leads" : "opportunities";
        const ref = db.collection(col).doc(t.entityId);
        const snap = await ref.get();
        if (!snap.exists) continue;
        const data = (snap.data() ?? {}) as Record<string, unknown>;
        const prevList = Array.isArray(data.tasks) ? ([...data.tasks] as RawTaskIn[]) : [];
        const one = prevList.find((x) => String(x.id ?? "") === t.id);
        if (!one) continue;
        const reconciled = await reconcileTasksGoogleCalendar(prevList, [one], {
          entityType: t.entityType,
          entityId: t.entityId,
          entityLabel: t.entityName,
        });
        const updated = reconciled[0];
        if (!updated) continue;
        const nextTasks = prevList.map((x) => (String(x.id ?? "") === t.id ? updated : x));
        await persistTasksForEntity(col, t.entityId, nextTasks);
        ok += 1;
      } catch (e) {
        errors.push(`${t.title}: ${e instanceof Error ? e.message : "err"}`);
      }
    }
    return NextResponse.json({
      ok: true,
      synced: ok,
      considered: toSync.length,
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "sync failed" },
      { status: 500 }
    );
  }
}
