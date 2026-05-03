import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AnalysisPayload = {
  call_id: string;
  agent_id: string;
  customer_id?: string | null;
  summary_short: string;
  tab1_general_summary: string;
  tab2_personal_analysis: string;
  tab3_recommendations: string;
  document_markdown: string;
  confidence: number;
};

type Body = {
  idempotency_key?: string;
  call_id?: string;
  uploaded_at?: string;
  analysis?: unknown;
};

function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.CRM_HMAC_SECRET?.trim() ?? "";
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function isAnalysis(v: unknown): v is AnalysisPayload {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.call_id === "string" &&
    typeof a.agent_id === "string" &&
    (typeof a.customer_id === "undefined" ||
      a.customer_id === null ||
      typeof a.customer_id === "string") &&
    typeof a.summary_short === "string" &&
    typeof a.tab1_general_summary === "string" &&
    typeof a.tab2_personal_analysis === "string" &&
    typeof a.tab3_recommendations === "string" &&
    typeof a.document_markdown === "string" &&
    typeof a.confidence === "number"
  );
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-signature-sha256") ?? "";
  const rawBody = await req.text();
  if (!signature || !verifySignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  let parsed: Body;
  try {
    parsed = JSON.parse(rawBody) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idempotencyKey = typeof parsed.idempotency_key === "string" ? parsed.idempotency_key.trim() : "";
  const callId = typeof parsed.call_id === "string" ? parsed.call_id.trim() : "";
  const uploadedAt = typeof parsed.uploaded_at === "string" ? parsed.uploaded_at.trim() : "";
  if (!idempotencyKey || idempotencyKey.length < 8 || !callId || !uploadedAt) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }
  if (!isAnalysis(parsed.analysis)) {
    return NextResponse.json({ ok: false, error: "Invalid analysis" }, { status: 400 });
  }

  const db = await getAdminDb();
  const docRef = db.collection("call_insights").doc(idempotencyKey);
  const existing = await docRef.get();
  if (existing.exists) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await docRef.set({
    idempotency_key: idempotencyKey,
    call_id: callId,
    uploaded_at: uploadedAt,
    analysis: parsed.analysis,
    received_at: new Date().toISOString()
  });

  return NextResponse.json({ ok: true });
}
