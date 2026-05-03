import { NextRequest, NextResponse } from "next/server";
import {
  requireApprovedUser,
  requireApprovedUserOrIngestApiKey,
} from "@/lib/auth/guard";
import { listLeadsFiltered, upsertLead } from "@/lib/leads/repo";
import { phoneSearchMatches } from "@/lib/phoneSearch";
import { validateCustomValues } from "@/lib/customFields/repo";
import { isAdminEmail } from "@/lib/auth/profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = {
  ok: true;
  headers: string[];
  count: number;
  rows: Record<string, string>[];
};
type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUserOrIngestApiKey(req);
  if (!auth.ok)
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );

  const dateFrom = req.nextUrl.searchParams.get("date_from");
  const dateTo = req.nextUrl.searchParams.get("date_to");
  const phoneQ = req.nextUrl.searchParams.get("phone")?.trim() ?? "";
  const mineOnly = req.nextUrl.searchParams.get("mine") === "1";

  try {
    let leads = await listLeadsFiltered(dateFrom, dateTo);
    if (phoneQ) {
      leads = leads.filter((l) => phoneSearchMatches(l.phone, phoneQ));
    }

    if (mineOnly && auth.ok && auth.user?.email) {
      const adminUser =
        auth.user.profile.role === "admin" || isAdminEmail(auth.user.email);
      if (!adminUser) {
        const em = auth.user.email.trim().toLowerCase();
        leads = leads.filter(
          (l) => (l.assignedRep ?? "").trim().toLowerCase() === em
        );
      }
    }

    // Build dynamic headers based on customFields keys too.
    const fixedHeaders = [
      "contactCode",
      "name",
      "email",
      "phone",
      "status",
      "assignedRep",
      "labelIds",
      "createdAt",
      "id",
    ];
    const customKeys = new Set<string>();
    const rows: Record<string, string>[] = [];

    for (const l of leads) {
      const createdAt = l.createdAt ? l.createdAt.toISOString() : "";
      const customFields = l.customFields ?? {};
      for (const k of Object.keys(customFields)) customKeys.add(k);

      rows.push({
        id: l.id,
        contactCode: l.contactCode ?? "",
        name: l.name ?? "",
        email: l.email ?? "",
        phone: l.phone ?? "",
        status: l.status ?? "פתוח",
        assignedRep: l.assignedRep ?? "",
        labelIds: (l.labelIds ?? []).join(","),
        createdAt,
        ...Object.fromEntries(
          Object.entries(customFields).map(([k, v]) => [k, v == null ? "" : String(v)])
        ),
      });
    }

    const headers = [...fixedHeaders, ...Array.from(customKeys).sort()];

    const payload: ApiOk = {
      ok: true,
      headers,
      count: rows.length,
      rows,
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message } satisfies ApiErr,
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUserOrIngestApiKey(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }

  try {
    const body = (await req.json()) as {
      email?: string;
      phone?: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      status?: "פתוח" | "זכיה" | "הפסד";
      source?: string;
      customFields?: Record<string, unknown>;
      customValues?: Record<string, unknown>;
      uniqueKey?: string;
      assignedRep?: string;
      pipelineId?: string;
    };

    const pipe = body.pipelineId?.trim() || null;
    const customValues = await validateCustomValues(
      "contact",
      body.customValues ?? body.customFields,
      { pipelineId: pipe }
    );

    const lead = await upsertLead({
      uniqueKey: body.uniqueKey,
      email: body.email,
      phone: body.phone,
      name: body.name,
      firstName: body.firstName,
      lastName: body.lastName,
      status: body.status ?? "פתוח",
      source: body.source ?? "manual",
      pipelineId: pipe ?? undefined,
      customFields: customValues,
      assignedRep: body.assignedRep,
    });

    return NextResponse.json({
      ok: true,
      lead: {
        id: lead.id,
        contactCode: lead.contactCode ?? "",
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        name: lead.name ?? "",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message } satisfies ApiErr,
      { status: 400 }
    );
  }
}

