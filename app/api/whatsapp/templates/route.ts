import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  listWhatsAppTemplates,
  saveWhatsAppTemplate,
  type WhatsAppHeaderFormat,
  type WhatsAppTemplateButton,
  type WhatsAppTemplateCategory,
} from "@/lib/whatsapp/repo";
import type { TemplateParamSource } from "@/lib/whatsapp/templateParams";

export const dynamic = "force-dynamic";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const templates = await listWhatsAppTemplates(db);
    return NextResponse.json({ ok: true, templates });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body: {
    id?: string;
    name?: string;
    category?: string;
    language?: string;
    bodyText?: string;
    exampleValues?: string[];
    parameterSources?: string[];
    buttonRows?: Array<{ type?: string; text?: string; url?: string }>;
    headerFormat?: WhatsAppHeaderFormat;
    headerText?: string;
    headerMediaUrl?: string;
    footerText?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const name = body.name?.trim() ?? "";
  const bodyText = body.bodyText?.trim() ?? "";
  if (!name || !bodyText) {
    return NextResponse.json({ ok: false, error: "name and bodyText are required" }, { status: 400 });
  }
  const category: WhatsAppTemplateCategory =
    body.category === "UTILITY" || body.category === "AUTHENTICATION" ? body.category : "MARKETING";
  try {
    const db = await getAdminDb();
    const saved = await saveWhatsAppTemplate(db, {
      id: body.id?.trim() || randomUUID(),
      name,
      category,
      language: body.language?.trim() || "he",
      bodyText,
      exampleValues: Array.isArray(body.exampleValues) ? body.exampleValues : [],
      headerFormat: body.headerFormat,
      headerText: body.headerText,
      headerMediaUrl: body.headerMediaUrl,
      footerText: body.footerText,
      parameterSources: Array.isArray(body.parameterSources)
        ? (body.parameterSources as TemplateParamSource[])
        : undefined,
      buttonRows: Array.isArray(body.buttonRows)
        ? (body.buttonRows as WhatsAppTemplateButton[])
        : undefined,
      status: "draft",
    });
    return NextResponse.json({ ok: true, template: saved });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
