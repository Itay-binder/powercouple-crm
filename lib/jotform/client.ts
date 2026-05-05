import { Readable } from "stream";
import { google } from "googleapis";

export type JotformQuestion = {
  id: string;
  text: string;
  type: string;
  options?: string[];
};

export type JotformForm = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
};

export type JotformAnswer = {
  questionId: string;
  label: string;
  type: string;
  value: string;
  fileUrls: string[];
};

export type JotformSubmission = {
  submissionId: string;
  formId: string;
  createdAt?: string;
  status?: string;
  answers: JotformAnswer[];
};

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n");
}

function getGoogleServiceAccountCreds(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_JSON");
  return { client_email: parsed.client_email, private_key: normalizePrivateKey(parsed.private_key) };
}

function driveClient() {
  const creds = getGoogleServiceAccountCreds();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

export async function fetchJotformQuestions(apiKey: string, formId: string): Promise<JotformQuestion[]> {
  const res = await fetch(`https://api.jotform.com/form/${encodeURIComponent(formId)}/questions?apiKey=${encodeURIComponent(apiKey)}`, { cache: "no-store" });
  const j = (await res.json().catch(() => ({}))) as {
    responseCode?: number;
    content?: Record<string, Record<string, unknown>>;
    message?: string;
  };
  if (!res.ok || j.responseCode !== 200 || !j.content) {
    throw new Error(j.message || "Failed to read Jotform questions");
  }
  return Object.entries(j.content)
    .map(([id, q]) => {
      const rawOptions = typeof q.options === "string" ? q.options : "";
      return {
        id,
        text: String(q.text ?? q.name ?? "").trim(),
        type: String(q.type ?? "").trim(),
        options: rawOptions
          ? rawOptions
              .split("|")
              .map((x) => x.trim())
              .filter(Boolean)
          : undefined,
      } satisfies JotformQuestion;
    })
    .filter((q) => q.id && q.text && q.type);
}

export async function fetchJotformForms(apiKey: string): Promise<JotformForm[]> {
  const res = await fetch(
    `https://api.jotform.com/user/forms?apiKey=${encodeURIComponent(apiKey)}&limit=1000`,
    { cache: "no-store" }
  );
  const j = (await res.json().catch(() => ({}))) as {
    responseCode?: number;
    content?: Array<Record<string, unknown>>;
    message?: string;
  };
  if (!res.ok || j.responseCode !== 200 || !Array.isArray(j.content)) {
    throw new Error(j.message || "Failed to read Jotform forms");
  }
  return j.content
    .map((f) => ({
      id: String(f.id ?? "").trim(),
      title: String(f.title ?? f.username ?? "").trim() || "Untitled Form",
      createdAt: typeof f.created_at === "string" ? f.created_at : undefined,
      updatedAt: typeof f.updated_at === "string" ? f.updated_at : undefined,
    }))
    .filter((f) => f.id);
}

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => asText(x)).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.prettyFormat === "string") return o.prettyFormat;
    const joined = Object.values(o).map((x) => asText(x)).filter(Boolean).join(" ");
    return joined.trim();
  }
  return "";
}

function extractFileUrls(v: unknown): string[] {
  if (typeof v === "string") {
    return v
      .split(",")
      .map((x) => x.trim())
      .filter((x) => /^https?:\/\//i.test(x));
  }
  if (Array.isArray(v)) {
    return v.map((x) => asText(x)).filter((x) => /^https?:\/\//i.test(x));
  }
  if (v && typeof v === "object") {
    return Object.values(v as Record<string, unknown>)
      .map((x) => asText(x))
      .filter((x) => /^https?:\/\//i.test(x));
  }
  return [];
}

export async function fetchSubmissionAnswers(
  apiKey: string,
  submissionId: string
): Promise<JotformAnswer[]> {
  const res = await fetch(`https://api.jotform.com/submission/${encodeURIComponent(submissionId)}?apiKey=${encodeURIComponent(apiKey)}`, { cache: "no-store" });
  const j = (await res.json().catch(() => ({}))) as {
    responseCode?: number;
    content?: { answers?: Record<string, Record<string, unknown>> };
    message?: string;
  };
  if (!res.ok || j.responseCode !== 200 || !j.content?.answers) {
    throw new Error(j.message || "Failed to read Jotform submission");
  }
  return Object.entries(j.content.answers)
    .map(([qid, a]) => {
      const ans = a.answer;
      return {
        questionId: qid,
        label: String(a.text ?? "").trim(),
        type: String(a.type ?? "").trim(),
        value: asText(ans),
        fileUrls: extractFileUrls(ans),
      } satisfies JotformAnswer;
    })
    .filter((a) => a.questionId && (a.value || a.fileUrls.length > 0));
}

export async function fetchJotformSubmissions(
  apiKey: string,
  formId: string,
  limit = 50
): Promise<JotformSubmission[]> {
  const res = await fetch(
    `https://api.jotform.com/form/${encodeURIComponent(formId)}/submissions?apiKey=${encodeURIComponent(
      apiKey
    )}&limit=${Math.max(1, Math.min(200, limit))}`,
    { cache: "no-store" }
  );
  const j = (await res.json().catch(() => ({}))) as {
    responseCode?: number;
    content?: Array<Record<string, unknown>>;
    message?: string;
  };
  if (!res.ok || j.responseCode !== 200 || !Array.isArray(j.content)) {
    throw new Error(j.message || "Failed to read Jotform submissions");
  }

  return j.content.map((s) => {
    const answersObj =
      s.answers && typeof s.answers === "object"
        ? (s.answers as Record<string, Record<string, unknown>>)
        : {};
    const answers: JotformAnswer[] = Object.entries(answersObj)
      .map(([qid, a]) => {
        const ans = a.answer;
        return {
          questionId: qid,
          label: String(a.text ?? "").trim(),
          type: String(a.type ?? "").trim(),
          value: asText(ans),
          fileUrls: extractFileUrls(ans),
        } satisfies JotformAnswer;
      })
      .filter((a) => a.questionId && (a.value || a.fileUrls.length > 0));

    return {
      submissionId: String(s.id ?? "").trim(),
      formId,
      createdAt: typeof s.created_at === "string" ? s.created_at : undefined,
      status: typeof s.status === "string" ? s.status : undefined,
      answers,
    } satisfies JotformSubmission;
  });
}

export async function createDriveFolderAndUploadFiles(input: {
  parentFolderId: string;
  folderName: string;
  files: Array<{ url: string; nameHint?: string }>;
}): Promise<{ folderId: string; folderUrl: string; uploaded: string[] }> {
  const drive = driveClient();
  const folderRes = await drive.files.create({
    requestBody: {
      name: input.folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [input.parentFolderId],
    },
    fields: "id,webViewLink",
  });
  const folderId = String(folderRes.data.id ?? "");
  if (!folderId) throw new Error("Drive folder creation failed");
  const folderUrl =
    String(folderRes.data.webViewLink ?? "").trim() ||
    `https://drive.google.com/drive/folders/${folderId}`;

  const uploaded: string[] = [];
  for (const f of input.files) {
    const fileRes = await fetch(f.url, { cache: "no-store" });
    if (!fileRes.ok) continue;
    const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const urlName = f.url.split("/").pop()?.split("?")[0] || "";
    const fileName = (f.nameHint?.trim() || urlName || `file-${Date.now()}`).slice(0, 180);
    await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: contentType, body: Readable.from(buffer) },
      fields: "id,name",
    });
    uploaded.push(fileName);
  }
  return { folderId, folderUrl, uploaded };
}

