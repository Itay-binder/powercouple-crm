import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listJotformSubmissionsByTarget } from "@/lib/jotform/submissionsRepo";
import { getJotformConfig } from "@/lib/jotform/configRepo";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId")?.trim() ?? "";
  const opportunityId = searchParams.get("opportunityId")?.trim() ?? "";
  const formIdParam = searchParams.get("formId")?.trim() ?? "";
  try {
    const cfg = await getJotformConfig();
    const formId = formIdParam || cfg.formId?.trim() || "";
    if (!contactId && !opportunityId && !formId) {
      return NextResponse.json(
        { ok: false, error: "contactId/opportunityId/formId required" },
        { status: 400 }
      );
    }
    const submissions = await listJotformSubmissionsByTarget({
      contactId: contactId || undefined,
      opportunityId: opportunityId || undefined,
      formId: formId || undefined,
    });
    return NextResponse.json({ ok: true, submissions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load submissions";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

