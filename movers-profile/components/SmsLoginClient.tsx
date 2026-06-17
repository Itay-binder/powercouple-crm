"use client";

import { useState, useRef, useEffect } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type ConfirmationResult,
  type Auth,
} from "firebase/auth";

type Props = {
  slug: string;
  onSuccess?: () => void;
  /** בתוך לשונית ניהול בדף מאוחד — בלי מסך מלא */
  embedded?: boolean;
};

export default function SmsLoginClient({ slug, onSuccess, embedded = false }: Props) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const authRef = useRef<Auth | null>(null);

  useEffect(() => {
    authRef.current = getFirebaseAuth();
  }, []);

  async function handleSendCode() {
    if (!phone.trim()) return;
    setLoading(true);
    setError("");
    try {
      const auth = authRef.current!;
      if (!verifierRef.current) {
        verifierRef.current = new RecaptchaVerifier(
          auth,
          recaptchaContainerRef.current!,
          { size: "invisible" }
        );
      }
      // Format phone as E.164 for Firebase
      let formatted = phone.trim().replace(/[^\d+]/g, "");
      if (!formatted.startsWith("+")) {
        if (formatted.startsWith("0")) formatted = `+972${formatted.slice(1)}`;
        else if (formatted.startsWith("972")) formatted = `+${formatted}`;
        else formatted = `+972${formatted}`;
      }
      const result = await signInWithPhoneNumber(auth, formatted, verifierRef.current);
      setConfirmation(result);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשליחת קוד");
      // Reset verifier on error
      verifierRef.current = null;
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (!code.trim() || !confirmation) return;
    setLoading(true);
    setError("");
    try {
      const userCredential = await confirmation.confirm(code.trim());
      const idToken = await userCredential.user.getIdToken();
      const res = await fetch("/api/movers/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, slug }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "אין גישה לפרופיל זה");
        return;
      }
      onSuccess?.();
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "קוד שגוי, נסה שוב");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: embedded ? "auto" : "100vh",
        padding: embedded ? "24px 16px 48px" : undefined,
        background: "linear-gradient(135deg, #0d0d1a 0%, #130d2b 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-rubik), Rubik, sans-serif",
        direction: "rtl",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(139,92,246,0.3)",
          backdropFilter: "blur(20px)",
          borderRadius: 24,
          padding: "40px 32px",
          width: "100%",
          maxWidth: 380,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 800, color: "#f9fafb", marginBottom: 8 }}>
          כניסה לניהול הפרופיל
        </div>
        <div style={{ color: "#9ca3af", fontSize: 14, marginBottom: 32 }}>
          {step === "phone"
            ? "הזן את מספר הטלפון שלך ונשלח קוד אימות"
            : "הזן את קוד האימות שנשלח לטלפון שלך"}
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: 8,
              padding: "10px 16px",
              color: "#fca5a5",
              fontSize: 14,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        {step === "phone" ? (
          <>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="050-123-4567"
              onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 12,
                border: "1px solid rgba(139,92,246,0.4)",
                background: "rgba(255,255,255,0.07)",
                color: "#f9fafb",
                fontSize: 18,
                textAlign: "center",
                outline: "none",
                marginBottom: 20,
                fontFamily: "inherit",
                letterSpacing: 2,
              }}
            />
            <button
              onClick={handleSendCode}
              disabled={loading || !phone.trim()}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading || !phone.trim() ? 0.6 : 1,
                fontFamily: "inherit",
              }}
            >
              {loading ? "שולח…" : "שלח קוד"}
            </button>
          </>
        ) : (
          <>
            <div style={{ color: "#a78bfa", fontSize: 13, marginBottom: 16 }}>
              קוד נשלח ל-{phone}
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="• • • • • •"
              maxLength={6}
              onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 12,
                border: "1px solid rgba(139,92,246,0.4)",
                background: "rgba(255,255,255,0.07)",
                color: "#f9fafb",
                fontSize: 24,
                textAlign: "center",
                outline: "none",
                marginBottom: 20,
                fontFamily: "monospace",
                letterSpacing: 8,
              }}
            />
            <button
              onClick={handleVerifyCode}
              disabled={loading || code.length < 4}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading || code.length < 4 ? 0.6 : 1,
                fontFamily: "inherit",
                marginBottom: 12,
              }}
            >
              {loading ? "מאמת…" : "כניסה"}
            </button>
            <button
              onClick={() => { setStep("phone"); setCode(""); setError(""); }}
              style={{
                background: "none",
                border: "none",
                color: "#9ca3af",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              שנה מספר
            </button>
          </>
        )}

        <div ref={recaptchaContainerRef} />
      </div>
    </div>
  );
}