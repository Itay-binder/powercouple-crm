"use client";

import { signInWithPopup, signOut } from "firebase/auth";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase/client";

const LOGIN_TITLE = "התחברות ל-CRM";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/dashboard";
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onGoogle() {
    setErr(null);
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const cred = await signInWithPopup(auth, getGoogleProvider());
      const idToken = await cred.user.getIdToken();

      const r = await fetch("/api/auth/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };

      if (!r.ok) {
        if (r.status === 403 && data.code === "NOT_INVITED") {
          await signOut(auth);
        }
        setErr(data.error ?? "התחברות נכשלה");
        return;
      }

      const next =
        returnTo.startsWith("/") && !returnTo.includes("//")
          ? returnTo
          : "/dashboard";
      window.location.assign(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div
        style={{
          width: "min(420px, 92vw)",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 22,
          background: "#fff",
          boxShadow: "0 12px 40px rgba(0,0,0,0.06)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>{LOGIN_TITLE}</h1>
        <p style={{ margin: "8px 0 16px", color: "#4b5563" }}>
          המשך עם חשבון Google
        </p>
        <button
          type="button"
          onClick={() => void onGoogle()}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
            color: "#fff",
          }}
        >
          {loading ? "מתחבר…" : "המשך עם Google"}
        </button>
        {err && (
          <p
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              background: "#fef2f2",
              color: "#b91c1c",
              border: "1px solid #fecaca",
              fontSize: 14,
            }}
          >
            {err}
          </p>
        )}
      </div>
    </main>
  );
}

