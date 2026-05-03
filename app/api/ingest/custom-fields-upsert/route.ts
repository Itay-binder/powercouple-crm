import { NextRequest, NextResponse } from "next/server";
import { isValidIngestApiKeyAsync } from "@/lib/ingest/apiKey";
import {
  upsertCustomField,
  type CustomFieldEntity,
  type CustomFieldType,
} from "@/lib/customFields/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

type InField = {
  fieldId?: string;
  entityType?: CustomFieldEntity;
  label?: string;
  type?: CustomFieldType;
  options?: string[];
  pipelineIds?: string[];
  isRequired?: boolean;
  isActive?: boolean;
};

export async function POST(req: NextRequest) {
  if (!(await isValidIngestApiKeyAsync(req))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" } satisfies ApiErr,
      { status: 401 }
    );
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      fields?: InField[];
      field?: InField;
    };
    const fields = Array.isArray(body.fields)
      ? body.fields
      : body.field
        ? [body.field]
        : [];
    if (fields.length === 0) {
      return NextResponse.json(
        { ok: false, error: "field/fields is required" } satisfies ApiErr,
        { status: 400 }
      );
    }
    if (fields.length > 500) {
      return NextResponse.json(
        { ok: false, error: "Maximum 500 fields per request" } satisfies ApiErr,
        { status: 400 }
      );
    }

    const out = [];
    for (const f of fields) {
      const saved = await upsertCustomField({
        fieldId: f.fieldId,
        entityType: f.entityType ?? "opportunity",
        label: f.label ?? "",
        type: f.type ?? "text",
        options: Array.isArray(f.options) ? f.options : [],
        pipelineIds: Array.isArray(f.pipelineIds) ? f.pipelineIds : [],
        isRequired: f.isRequired ?? false,
        isActive: f.isActive ?? true,
      });
      out.push(saved);
    }

    return NextResponse.json({ ok: true, fields: out });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
