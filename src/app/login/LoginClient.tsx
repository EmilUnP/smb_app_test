"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName, password }),
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }

      const returnTo = searchParams.get("returnTo");
      if (returnTo === "ai-studio") {
        const handoff = await fetch("/api/handoff/create", { method: "POST" });
        const handoffData = (await handoff.json()) as {
          url?: string;
          ssoUrl?: string;
          code?: string;
          error?: string;
        };
        if (!handoff.ok) {
          setError(handoffData.error ?? "Could not open AI Studio");
          return;
        }
        if (handoffData.code && (handoffData.ssoUrl || handoffData.url)) {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = handoffData.ssoUrl ?? handoffData.url!;
          form.style.display = "none";
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "code";
          input.value = handoffData.code;
          form.appendChild(input);
          document.body.appendChild(form);
          form.submit();
          return;
        }
        if (!handoffData.url) {
          setError(handoffData.error ?? "Could not open AI Studio");
          return;
        }
        window.location.assign(handoffData.url);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <p className="mb-2 text-sm font-medium tracking-wide text-slate-500 uppercase">
        SMB App
      </p>
      <h1 className="mb-2 text-3xl font-semibold text-slate-900">Sign in</h1>
      <p className="mb-8 text-slate-600">
        Uses the real SMB API at api.kob.sinam.az
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm text-slate-700">
          UserName
          <input
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            autoComplete="username"
            required
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-slate-500"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-slate-700">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-slate-500"
          />
        </label>

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {isLoading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
