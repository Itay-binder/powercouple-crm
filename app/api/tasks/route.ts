import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import {
  createTaskAndSync,
  listUnifiedTasks,
  type TaskStatus,
  updateTaskAndSync,
} from "@/lib/tasks/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  try {
    const status = req.nextUrl.searchParams.get("status") as TaskStatus | null;
    const tasks = await listUnifiedTasks();
    return NextResponse.json({
      ok: true,
      tasks:
        status === "todo" || status === "in_progress" || status === "done"
          ? tasks.filter((t) => t.status === status)
          : tasks,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  try {
    const body = (await req.json()) as {
      entityType?: "contact" | "opportunity" | "deal";
      entityId?: string;
      taskId?: string;
      status?: TaskStatus;
      title?: string;
      dueAt?: string;
      reminderAt?: string;
      commentText?: string;
      syncToGoogleCalendar?: boolean;
      googleCalendarId?: string;
    };
    const entityType = body.entityType;
    const entityId = body.entityId?.trim();
    const taskId = body.taskId?.trim();
    if (!entityType || !entityId || !taskId) {
      throw new Error("entityType, entityId and taskId are required");
    }
    const task = await updateTaskAndSync({
      entityType,
      entityId,
      taskId,
      status: body.status,
      title: body.title,
      dueAt: body.dueAt,
      reminderAt: body.reminderAt,
      commentText: body.commentText,
      syncToGoogleCalendar: body.syncToGoogleCalendar,
      googleCalendarId: body.googleCalendarId,
    });
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  try {
    const body = (await req.json()) as {
      entityType?: "contact" | "opportunity" | "deal";
      entityId?: string;
      title?: string;
      dueAt?: string;
      reminderAt?: string;
      status?: TaskStatus;
      syncToGoogleCalendar?: boolean;
      googleCalendarId?: string;
    };
    const entityType = body.entityType;
    const entityId = body.entityId?.trim();
    const title = body.title?.trim();
    if (!entityType || !entityId || !title) {
      throw new Error("entityType, entityId and title are required");
    }
    const task = await createTaskAndSync({
      entityType,
      entityId,
      title,
      dueAt: body.dueAt,
      reminderAt: body.reminderAt,
      status: body.status,
      syncToGoogleCalendar: body.syncToGoogleCalendar,
      googleCalendarId: body.googleCalendarId,
    });
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}

