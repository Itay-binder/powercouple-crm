"use client";

import { type ReactNode, useState } from "react";
import { digitsForWhatsAppMe } from "@/lib/whatsappDigits";

/** זיהוי עמודות מייל/טלפון לפי שם (כולל contact_email, opportunity_phone וכו׳) */
export function columnIntegrationKind(col: string): "email" | "phone" | null {
  const k = col.trim().toLowerCase().replace(/[\s-]+/g, "");
  if (k === "email" || k.endsWith("email")) return "email";
  if (k === "phone" || k === "mobile" || k === "tel" || k === "cell" || k.endsWith("phone"))
    return "phone";
  return null;
}

function extractEmail(raw: string): string | null {
  const m = raw.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  if (m) return m[0];
  const t = raw.trim();
  return t.includes("@") ? t.split(/\s+/)[0] : null;
}

function phoneForTel(raw: string): string {
  return raw.replace(/[^\d+]/g, "").trim() || raw.trim();
}

export function WhatsAppIconLink({
  phone,
  title = "וואטסאפ",
  size = 22,
}: {
  phone: string;
  title?: string;
  size?: number;
}) {
  const wa = digitsForWhatsAppMe(phone);
  if (!wa) return null;
  return (
    <a
      href={`https://wa.me/${wa}`}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: size + 10,
        height: size + 10,
        borderRadius: 8,
        border: "1px solid #bbf7d0",
        background: "#f0fdf4",
        color: "#16a34a",
        textDecoration: "none",
      }}
    >
      <WhatsAppGlyph size={size} />
    </a>
  );
}

function WhatsAppGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.883 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  readonly?: boolean;
  integration?: "email" | "phone" | null;
  /** ערך גולמי ל-mailto / tel / wa.me */
  rawValue: string;
  /** טקסט המוצג בתא */
  label: ReactNode;
  onEdit: () => void;
};

export function InlineFieldShell({
  readonly,
  integration,
  rawValue,
  label,
  onEdit,
}: Props) {
  const [hover, setHover] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const showChrome = !readonly && (hover || focusWithin);

  const borderColor = showChrome ? "#2563eb" : "transparent";

  let valueEl: ReactNode;

  if (!readonly && integration === "email") {
    const em = extractEmail(rawValue);
    if (em) {
      valueEl = (
        <a
          href={`mailto:${encodeURIComponent(em).replace(/%40/g, "@")}`}
          style={{
            flex: 1,
            textAlign: "right",
            color: "#2563eb",
            wordBreak: "break-word",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </a>
      );
    } else {
      valueEl = (
        <span style={{ flex: 1, textAlign: "right", wordBreak: "break-word", color: "#111827" }}>
          {label}
        </span>
      );
    }
  } else if (!readonly && integration === "phone") {
    const tel = phoneForTel(rawValue);
    const wa = digitsForWhatsAppMe(rawValue);
    valueEl = (
      <span
        style={{
          flex: 1,
          display: "inline-flex",
          flexWrap: "nowrap",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
          whiteSpace: "nowrap",
        }}
      >
        {tel ? (
          <a
            href={`tel:${tel}`}
            style={{
              color: "#2563eb",
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: 2,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {label}
          </a>
        ) : (
          <span style={{ color: "#111827", whiteSpace: "nowrap" }}>{label}</span>
        )}
        {wa ? (
          <span style={{ flexShrink: 0, display: "inline-flex" }}>
            <WhatsAppIconLink phone={rawValue} />
          </span>
        ) : null}
      </span>
    );
  } else {
    valueEl = (
      <span style={{ flex: 1, textAlign: "right", wordBreak: "break-word", color: "#111827" }}>
        {label}
      </span>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        minHeight: 34,
        padding: "4px 6px",
        borderRadius: 8,
        border: `2px solid ${borderColor}`,
        boxSizing: "border-box",
        transition: "border-color 0.12s ease",
        direction: "rtl",
      }}
      data-inline-field-shell
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(e) => {
        const rt = e.relatedTarget as Node | null;
        if (!rt || !(e.currentTarget as HTMLElement).contains(rt)) setFocusWithin(false);
      }}
    >
      {valueEl}
      {!readonly ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="עריכה מהירה"
          aria-label="עריכה מהירה"
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#fff",
            color: "#6b7280",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: showChrome ? 1 : 0,
            pointerEvents: showChrome ? "auto" : "none",
            transition: "opacity 0.12s ease",
          }}
        >
          <PencilIcon />
        </button>
      ) : null}
    </div>
  );
}
