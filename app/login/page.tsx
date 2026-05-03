import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>טוען…</p>}>
      <LoginForm />
    </Suspense>
  );
}

