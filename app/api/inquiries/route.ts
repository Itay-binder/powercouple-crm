import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { createInquiry, listInquiries } from "@/lib/inquiries/repo";
import { appendLeadNote, getLeadById, updateLead } from "@/lib/leads/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  try {
    const rows = await listInquiries();
    rows.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
    return NextResponse.json({ ok: true, inquiries: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  try {
    const body = (await req.json().catch(() => ({}))) as {
      content?: string;
      responseDraft?: string;
      reminderAt?: string;
      makeTask?: boolean;
      contactId?: string;
      contactName?: string;
    };

    const content = String(body.content ?? "").trim();
    if (!content) throw new Error("תוכן פנייה נדרש");

    const responseDraft = String(body.responseDraft ?? "").trim();
    const reminderAt = String(body.reminderAt ?? "").trim();
    const makeTask = Boolean(body.makeTask);
    const contactId = String(body.contactId ?? "").trim();
    let contactName = String(body.contactName ?? "").trim();
    let taskId = "";

    if (makeTask) {
      if (!contactId) throw new Error("כדי להפוך למשימה, יש לשייך לקוח");
      const lead = await getLeadById(contactId);
      if (!lead) throw new Error("לקוח לא נמצא");
      contactName = contactName || lead.name || lead.email || lead.phone || lead.id;

      taskId = crypto.randomUUID();
      const dueAt = reminderAt || "";
      const currentTasks = lead.tasks ?? [];
      await updateLead(lead.id, {
        tasks: [
          ...currentTasks,
          {
            id: taskId,
            title: `פנייה: ${content.slice(0, 70)}`,
            dueAt,
            done: false,
            status: "todo",
            comments: responseDraft
              ? [{ id: crypto.randomUUID(), text: `טיוטת תשובה: ${responseDraft}`, createdAt: new Date().toISOString() }]
              : [],
            createdAt: new Date().toISOString(),
          },
        ],
      });
    } else if (contactId) {
      const lead = await getLeadById(contactId);
      if (lead) {
        contactName = contactName || lead.name || lead.email || lead.phone || lead.id;
      }
    }

    if (contactId) {
      await appendLeadNote(contactId, {
        text: `פנייה חדשה: ${content}${responseDraft ? `\nטיוטת תשובה: ${responseDraft}` : ""}`,
        createdBy: auth.user.email ?? "CRM",
        category: "פניות",
      });
    }

    const inquiry = await createInquiry({
      content,
      responseDraft,
      reminderAt,
      makeTask,
      contactId,
      contactName,
      taskId,
      status: reminderAt ? "scheduled" : "open",
    });

    return NextResponse.json({ ok: true, inquiry });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr, { status: 400 });
  }
}

