import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { reconcileTasksGoogleCalendar } from "@/lib/googleCalendar/taskSync";
import type { RawTaskIn } from "@/lib/tasks/merge";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskComment = { id: string; text: string; createdAt: string };
export type UnifiedTask = {
  id: string;
  title: string;
  dueAt: string;
  reminderAt?: string;
  status: TaskStatus;
  done: boolean;
  comments: TaskComment[];
  assignedRep?: string;
  entityType: "contact" | "opportunity";
  entityId: string;
  entityName: string;
  /** טלפון איש קשר (לחיוג מהיר) */
  entityPhone?: string;
  createdAt: string;
  /** "__contact__" for contact tasks, else opportunity pipeline id */
  pipelineId: string;
  pipelineName: string;
  syncToGoogleCalendar?: boolean;
  googleCalendarId?: string;
  googleEventId?: string;
};

type RawTask = {
  id?: string;
  title?: string;
  dueAt?: string;
  reminderAt?: string;
  reminderWebhookFiredAt?: string;
  deadline15mWebhookFiredAt?: string;
  done?: boolean;
  status?: TaskStatus;
  comments?: TaskComment[];
  createdAt?: string;
  syncToGoogleCalendar?: boolean;
  googleCalendarId?: string;
  googleEventId?: string;
};

function normalizeStatus(task: RawTask): TaskStatus {
  if (task.status === "todo" || task.status === "in_progress" || task.status === "done") {
    return task.status;
  }
  return task.done ? "done" : "todo";
}

function normalizeTask(raw: RawTask): UnifiedTask | null {
  const id = String(raw.id ?? "").trim();
  const title = String(raw.title ?? "").trim();
  if (!id || !title) return null;
  const status = normalizeStatus(raw);
  const rem = String(raw.reminderAt ?? "").trim();
  const gcal = String(raw.googleCalendarId ?? "").trim();
  return {
    id,
    title,
    dueAt: String(raw.dueAt ?? ""),
    ...(rem ? { reminderAt: rem } : {}),
    status,
    done: status === "done",
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    createdAt: String(raw.createdAt ?? ""),
    entityType: "contact",
    entityId: "",
    entityName: "",
    pipelineId: "__contact__",
    pipelineName: "אנשי קשר",
    ...(raw.syncToGoogleCalendar ? { syncToGoogleCalendar: true } : {}),
    ...(gcal ? { googleCalendarId: gcal } : {}),
    ...(raw.googleEventId ? { googleEventId: String(raw.googleEventId) } : {}),
  };
}

export async function listUnifiedTasks(): Promise<UnifiedTask[]> {
  const db = await getAdminDb();
  const [leadsSnap, oppSnap, pipelinesSnap] = await Promise.all([
    db.collection("leads").get(),
    db.collection("opportunities").get(),
    db.collection("pipelines").get(),
  ]);

  const pipelineNameById = new Map(
    pipelinesSnap.docs.map((d) => {
      const pd = (d.data() ?? {}) as Record<string, unknown>;
      return [d.id, String(pd.name ?? d.id)] as const;
    })
  );

  const out: UnifiedTask[] = [];
  for (const doc of leadsSnap.docs) {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    const tasks = Array.isArray(d.tasks) ? (d.tasks as RawTask[]) : [];
    for (const t of tasks) {
      const normalized = normalizeTask(t);
      if (!normalized) continue;
      out.push({
        ...normalized,
        assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
        entityType: "contact",
        entityId: doc.id,
        entityName:
          (typeof d.name === "string" && d.name) ||
          (typeof d.email === "string" && d.email) ||
          doc.id,
        entityPhone: typeof d.phone === "string" ? d.phone : undefined,
      });
    }
  }
  for (const doc of oppSnap.docs) {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    const tasks = Array.isArray(d.tasks) ? (d.tasks as RawTask[]) : [];
    for (const t of tasks) {
      const normalized = normalizeTask(t);
      if (!normalized) continue;
      out.push({
        ...normalized,
        assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
        entityType: "opportunity",
        entityId: doc.id,
        entityName: (typeof d.name === "string" && d.name) || doc.id,
      });
    }
  }
  return out.sort((a, b) => {
    const as = a.createdAt || "";
    const bs = b.createdAt || "";
    return bs.localeCompare(as);
  });
}

export async function updateTaskAndSync(
  input: {
    entityType: "contact" | "opportunity";
    entityId: string;
    taskId: string;
    status?: TaskStatus;
    title?: string;
    dueAt?: string;
    reminderAt?: string;
    commentText?: string;
    syncToGoogleCalendar?: boolean;
    googleCalendarId?: string;
  }
): Promise<UnifiedTask> {
  const db = await getAdminDb();
  const col = input.entityType === "contact" ? "leads" : "opportunities";
  const ref = db.collection(col).doc(input.entityId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Entity not found");
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const tasks = Array.isArray(data.tasks) ? ([...data.tasks] as RawTask[]) : [];
  const idx = tasks.findIndex((t) => String(t.id ?? "") === input.taskId);
  if (idx < 0) throw new Error("Task not found");

  const existing = tasks[idx];
  const nextStatus = input.status ?? normalizeStatus(existing);
  const comments = Array.isArray(existing.comments) ? [...existing.comments] : [];
  const trimmedComment = input.commentText?.trim();
  if (trimmedComment) {
    comments.push({
      id: crypto.randomUUID(),
      text: trimmedComment,
      createdAt: new Date().toISOString(),
    });
  }

  const prevDue = String(existing.dueAt ?? "").trim();
  const prevRem = String(existing.reminderAt ?? "").trim();
  const effDue = (input.dueAt !== undefined ? input.dueAt : String(existing.dueAt ?? "")).trim();
  const effRem = (input.reminderAt !== undefined ? input.reminderAt : String(existing.reminderAt ?? "")).trim();

  const nextTask: RawTask = {
    ...existing,
    title: input.title !== undefined ? input.title.trim() : existing.title,
    dueAt: input.dueAt !== undefined ? input.dueAt.trim() : existing.dueAt,
    status: nextStatus,
    done: nextStatus === "done",
    comments,
  };
  if (input.reminderAt !== undefined) {
    const r = input.reminderAt.trim();
    if (r) nextTask.reminderAt = r;
    else delete nextTask.reminderAt;
  }
  if (input.syncToGoogleCalendar !== undefined) {
    if (input.syncToGoogleCalendar) nextTask.syncToGoogleCalendar = true;
    else {
      delete nextTask.syncToGoogleCalendar;
      delete nextTask.googleCalendarId;
      delete nextTask.googleEventId;
    }
  }
  if (input.googleCalendarId !== undefined) {
    const gc = input.googleCalendarId.trim();
    if (gc) nextTask.googleCalendarId = gc;
    else delete nextTask.googleCalendarId;
  }
  if (effDue !== prevDue || effRem !== prevRem) {
    delete nextTask.reminderWebhookFiredAt;
    delete nextTask.deadline15mWebhookFiredAt;
  }
  const prevTasksForCal = [...tasks];
  const entityLabel =
    (typeof data.name === "string" && data.name) ||
    (typeof data.email === "string" && data.email) ||
    input.entityId;
  const reconciled = await reconcileTasksGoogleCalendar(
    prevTasksForCal as RawTaskIn[],
    [nextTask as RawTaskIn],
    {
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: String(entityLabel),
    }
  );
  tasks[idx] = (reconciled[0] ?? nextTask) as RawTask;

  const notes = Array.isArray(data.notes) ? [...(data.notes as Array<{ id: string; text: string; createdAt: string }>)] : [];
  if (trimmedComment) {
    notes.push({
      id: crypto.randomUUID(),
      text: `[Task ${String(existing.title ?? "")}] ${trimmedComment}`,
      createdAt: new Date().toISOString(),
    });
  }

  await ref.set(
    {
      tasks,
      notes,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // If this task belongs to an opportunity, also sync the documentation note to its contact.
  if (input.entityType === "opportunity" && trimmedComment) {
    const oppContactId = String(data.contactId ?? "").trim();
    if (oppContactId) {
      const contactRef = db.collection("leads").doc(oppContactId);
      const contactSnap = await contactRef.get();
      if (contactSnap.exists) {
        const contactData = (contactSnap.data() ?? {}) as Record<string, unknown>;
        const contactNotes = Array.isArray(contactData.notes)
          ? [...(contactData.notes as Array<{ id: string; text: string; createdAt: string }>)]
          : [];
        contactNotes.push({
          id: crypto.randomUUID(),
          text: `[Task ${String(existing.title ?? "")}] ${trimmedComment}`,
          createdAt: new Date().toISOString(),
        });
        await contactRef.set(
          {
            notes: contactNotes,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  }

  const entityName =
    (typeof data.name === "string" && data.name) ||
    (typeof data.email === "string" && data.email) ||
    input.entityId;
  const normalized = normalizeTask(tasks[idx]);
  if (!normalized) throw new Error("Task became invalid");

  let pipelineId = "__contact__";
  let pipelineName = "אנשי קשר";
  let entityPhone: string | undefined =
    input.entityType === "contact"
      ? typeof data.phone === "string"
        ? data.phone
        : undefined
      : (typeof data.contactPhone === "string" && data.contactPhone.trim()) ||
        (typeof data.phone === "string" && data.phone.trim()) ||
        undefined;
  if (input.entityType === "opportunity") {
    pipelineId = String(data.pipelineId ?? "").trim() || "__unknown_pipeline__";
    const pSnap = await db.collection("pipelines").doc(pipelineId).get();
    pipelineName = pSnap.exists
      ? String((pSnap.data() as Record<string, unknown>).name ?? pipelineId)
      : pipelineId;
  }

  return {
    ...normalized,
    assignedRep: typeof data.assignedRep === "string" ? data.assignedRep : undefined,
    entityType: input.entityType,
    entityId: input.entityId,
    entityName,
    entityPhone,
    pipelineId,
    pipelineName,
  };
}

