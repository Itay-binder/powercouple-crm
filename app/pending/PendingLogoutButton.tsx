"use client";

export default function PendingLogoutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
        window.location.href = "/login";
      }}
      style={{
        marginTop: 16,
        padding: "12px 16px",
        borderRadius: 12,
        border: "none",
        cursor: "pointer",
        fontWeight: 700,
        background: "#111827",
        color: "#fff",
      }}
    >
      התנתקות
    </button>
  );
}
