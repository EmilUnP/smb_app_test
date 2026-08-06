import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6">
          <p className="text-slate-600">Loading…</p>
        </main>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
