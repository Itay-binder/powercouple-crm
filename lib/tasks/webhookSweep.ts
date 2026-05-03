import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { parseTaskInstant } from "@/lib/datetime/taskTimestamps";
import type { RawTaskIn } from "@/lib/tasks/merge";
import { postWebhookForEvent } from "@/lib/webhooks/dispatchServerWebhooks";

type EntityCtx = {
  entityType: "contact" | "opportunity";
  entityId: string;
  entityName: string;
  pipelineId?: string;
  pipelineName?: string;
};


async function persistTaskPatch(
  collection: "leads" | "opportunities",
  docId: string,
  taskId: string,
  patch: Partial<RawTaskIn>
): Promise<void> {
  const db = await getAdminDb();
  const ref = db.collection(collection).doc(docId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const tasks = Array.isArray(data.tasks) ? ([...data.tasks] as RawTaskIn[]) : [];
  const idx = tasks.findIndex((t) => String(t.id ?? "") === taskId);
  if (idx < 0) return;
  tasks[idx] = { ...tasks[idx], ...patch };
  await ref.set({ tasks, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export type SweepResult = {
  customReminderSent: number;
  deadline15mSent: number;
  errors: string[];
};

export async function sweepTaskWebhooks(): Promise<SweepResult> {
  const out: SweepResult = { customReminderSent: 0, deadline15mSent: 0, errors: [] };
  const db = await getAdminDb();
  const now = new Date();

  const pipelinesSnap = await db.collection("pipelines").get();
  const pipelineNameById = new Map(
    pipelinesSnap.docs.map((d) => {
      const x = (d.data() ?? {}) as Record<string, unknown>;
      return [d.id, String(x.name ?? d.id)] as const;
    })
  );

  async function handleDoc(
    collection: "leads" | "opportunities",
    docId: string,
    d: Record<string, unknown>,
    ctxBase: Omit<EntityCtx, "entityName"> & { entityName: string }
  ) {
    const tasks = Array.isArray(d.tasks) ? (d.tasks as RawTaskIn[]) : [];
    const oppPipelineId =
      collection === "opportunities" ? String(d.pipelineId ?? "").trim() : "";
    const pipelineName =
      collection === "opportunities" && oppPipelineId
        ? pipelineNameById.get(oppPipelineId) ?? oppPipelineId
        : undefined;

    const ctx: EntityCtx = {
      ...ctxBase,
      pipelineId: collection === "opportunities" ? oppPipelineId || undefined : undefined,
      pipelineName,
    };

    for (const t of tasks) {
      const taskId = String(t.id ?? "").trim();
      const title = String(t.title ?? "").trim();
      if (!taskId || !title) continue;

      const due = parseTaskInstant(t.dueAt);
      const rem = parseTaskInstant(t.reminderAt);

      const taskPayload = {
        id: taskId,
        title,
        dueAt: t.dueAt ?? "",
        reminderAt: t.reminderAt ?? "",
        status: t.status ?? (t.done ? "done" : "todo"),
      };

      if (rem && !t.reminderWebhookFiredAt && now.getTime() >= rem.getTime()) {
        const ok = await postWebhookForEvent(db, "task_reminder_custom", {
          task: taskPayload,
          entity: { type: ctx.entityType, id: ctx.entityId, name: ctx.entityName },
          pipeline:
            ctx.entityType === "opportunity" && ctx.pipelineId
              ? { id: ctx.pipelineId, name: ctx.pipelineName ?? ctx.pipelineId }
              : null,
        });
        if (ok) {
          await persistTaskPatch(collection, docId, taskId, {
            reminderWebhookFiredAt: now.toISOString(),
          });
          out.customReminderSent++;
        } else {
          out.errors.push(`webhook fail custom ${collection}/${docId}/${taskId}`);
        }
      }

      if (due && !t.deadline15mWebhookFiredAt) {
        const triggerAt = new Date(due.getTime() - 15 * 60 * 1000);
        if (now.getTime() >= triggerAt.getTime() && now.getTime() < due.getTime()) {
          const ok = await postWebhookForEvent(db, "task_reminder_deadline_15m", {
            task: taskPayload,
            entity: { type: ctx.entityType, id: ctx.entityId, name: ctx.entityName },
            pipeline:
              ctx.entityType === "opportunity" && ctx.pipelineId
                ? { id: ctx.pipelineId, name: ctx.pipelineName ?? ctx.pipelineId }
                : null,
          });
          if (ok) {
            await persistTaskPatch(collection, docId, taskId, {
              deadline15mWebhookFiredAt: now.toISOString(),
            });
            out.deadline15mSent++;
          } else {
            out.errors.push(`webhook fail 15m ${collection}/${docId}/${taskId}`);
          }
        }
      }
    }
  }

  const [leadsSnap, oppSnap] = await Promise.all([
    db.collection("leads").get(),
    db.collection("opportunities").get(),
  ]);

  for (const doc of leadsSnap.docs) {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    const name =
      (typeof d.name === "string" && d.name) ||
      (typeof d.email === "string" && d.email) ||
      doc.id;
    await handleDoc("leads", doc.id, d, {
      entityType: "contact",
      entityId: doc.id,
      entityName: String(name),
    });
  }

  for (const doc of oppSnap.docs) {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    const name = (typeof d.name === "string" && d.name) || doc.id;
    await handleDoc("opportunities", doc.id, d, {
      entityType: "opportunity",
      entityId: doc.id,
      entityName: String(name),
    });
  }

  return out;
}
