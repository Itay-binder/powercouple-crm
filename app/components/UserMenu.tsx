"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { CrmTenantOption } from "@/app/components/CrmShell";

type Props = {
  email: string | null | undefined;
  tenants?: CrmTenantOption[];
  currentTenantId?: string | null;
};

function avatarLetter(email: string | null | undefined): string {
  const s = email?.trim() ?? "";
  if (!s) return "?";
  const ch = s[0];
  return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
}

export default function UserMenu({
  email,
  tenants = [],
  currentTenantId = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const onLogout = async () => {
    setOpen(false);
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // ignore
    }
    await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
    window.location.href = "/login";
  };

  const letter = useMemo(() => avatarLetter(email), [email]);
  const showTenantSwitcher = tenants.length > 1;

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  async function switchTenant(tenantId: string) {
    if (!tenantId || tenantId === currentTenantId) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/auth/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
        credentials: "include",
      });
      if (!res.ok) {
        setSwitching(false);
        return;
      }
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }

  return (
    <div style={{ position: "relative" }} ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="תפריט משתמש"
        disabled={switching}
        style={{
          width: 40,
          height: 40,
          borderRadius: "999px",
          border: "none",
          cursor: switching ? "wait" : "pointer",
          opacity: switching ? 0.7 : 1,
          background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 16,
        }}
      >
        {letter}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            left: 0,
            top: "calc(100% + 8px)",
            zIndex: 50,
            minWidth: 260,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
            boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
            padding: 10,
          }}
        >
          <div
            dir="ltr"
            style={{
              padding: "8px 12px",
              fontSize: 12,
              wordBreak: "break-all",
              color: "#111827",
              fontWeight: 500,
              borderBottom: "1px solid #f3f4f6",
              marginBottom: 8,
            }}
          >
            {email ?? "—"}
          </div>
          {showTenantSwitcher && (
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                color: "#6b7280",
                margin: "4px 4px 6px",
              }}
            >
              עסק / CRM
              <select
                aria-label="מעבר בין עסקים"
                value={currentTenantId ?? tenants[0]?.id ?? ""}
                onChange={(e) => void switchTenant(e.target.value)}
                disabled={switching}
                style={{
                  marginTop: 6,
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  fontSize: 13,
                  background: "#f9fafb",
                }}
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void onLogout()}
            style={{
              width: "100%",
              marginTop: showTenantSwitcher ? 10 : 0,
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#7f1d1d",
              fontWeight: 600,
            }}
          >
            התנתקות
          </button>
        </div>
      )}
    </div>
  );
}
