"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type Entity = { id: string; name?: string };

type Props = {
  userName?: string;
  tenantId?: string;
  tenantName?: string;
  companyId?: string;
  companyName?: string;
  accountType?: string;
};

export default function HomeActions({
  userName,
  tenantId,
  tenantName,
  companyId,
  companyName,
  accountType,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [debugRaw, setDebugRaw] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tenants, setTenants] = useState<Entity[]>([]);
  const [companies, setCompanies] = useState<Entity[]>([]);
  const [activeTenantId, setActiveTenantId] = useState(tenantId ?? "");
  const [activeTenantName, setActiveTenantName] = useState(tenantName ?? "");
  const [activeCompanyId, setActiveCompanyId] = useState(companyId ?? "");
  const [activeCompanyName, setActiveCompanyName] = useState(companyName ?? "");
  const [manualTenantId, setManualTenantId] = useState("");
  const [manualCompanyId, setManualCompanyId] = useState("");
  const [accountLabel, setAccountLabel] = useState(accountType ?? "");

  const loadSession = async () => {
    setError(null);
    try {
      const res = await fetch("/api/auth/tenants");
      const data = (await res.json()) as {
        tenants?: Entity[];
        companies?: Entity[];
        tenantId?: string | null;
        tenantName?: string | null;
        companyId?: string | null;
        companyName?: string | null;
        accountType?: string | null;
        tenantSource?: string;
        isPlatformUser?: boolean;
        warnings?: string[];
        hint?: string | null;
        context?: unknown;
        platformMe?: unknown;
        me?: unknown;
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? "Failed to load auth session");
        return;
      }

      setTenants(data.tenants ?? []);
      setCompanies(data.companies ?? []);
      setWarnings(data.warnings ?? []);
      setAccountLabel(data.accountType ?? (data.isPlatformUser ? "platform" : ""));

      if (data.tenantId) {
        setActiveTenantId(data.tenantId);
        setActiveTenantName(data.tenantName ?? "");
      }
      if (data.companyId) {
        setActiveCompanyId(data.companyId);
        setActiveCompanyName(data.companyName ?? "");
      }

      if (!data.tenantId) {
        setDebugRaw(
          [
            data.hint,
            `source=${data.tenantSource ?? "unknown"}`,
            `context=${JSON.stringify(data.context ?? null)}`,
            `platformMe=${JSON.stringify(data.platformMe ?? null)}`,
          ]
            .filter(Boolean)
            .join(" | "),
        );
      } else {
        setDebugRaw(null);
      }

      router.refresh();
    } catch {
      setError("Network error while loading auth session");
    }
  };

  useEffect(() => {
    void loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectContext = async (payload: {
    tenantId?: string;
    companyId?: string;
  }) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        error?: string;
        warnings?: string[];
        tenantId?: string | null;
        tenantName?: string | null;
        companyId?: string | null;
        companyName?: string | null;
        tenants?: Entity[];
        companies?: Entity[];
      };
      if (!res.ok) {
        setError(data.error ?? "Could not update tenant/company");
        return;
      }
      setWarnings(data.warnings ?? []);
      setTenants(data.tenants ?? []);
      setCompanies(data.companies ?? []);
      if (data.tenantId) {
        setActiveTenantId(data.tenantId);
        setActiveTenantName(data.tenantName ?? "");
      }
      if (data.companyId) {
        setActiveCompanyId(data.companyId);
        setActiveCompanyName(data.companyName ?? "");
      } else {
        setActiveCompanyId("");
        setActiveCompanyName("");
      }
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenAiStudio = () => {
    setError(null);
    setIsOpening(true);
    // Full page navigation to server-rendered auto-POST launch.
    // Avoids fetch/React canceling the cross-site SSO submit.
    window.location.assign("/api/handoff/launch");
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const handleRefresh = async () => {
    setError(null);
    const res = await fetch("/api/auth/refresh", { method: "POST" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Refresh failed");
      return;
    }
    await loadSession();
  };

  const handleManualTenant = async (event: FormEvent) => {
    event.preventDefault();
    const nextId = manualTenantId.trim();
    if (!nextId) return;
    await selectContext({ tenantId: nextId });
    setManualTenantId("");
  };

  const handleManualCompany = async (event: FormEvent) => {
    event.preventDefault();
    const nextId = manualCompanyId.trim();
    if (!nextId || !activeTenantId) return;
    await selectContext({ tenantId: activeTenantId, companyId: nextId });
    setManualCompanyId("");
  };

  return (
    <div className="mt-8 flex flex-col gap-3">
      <p className="text-slate-700">
        Signed in as{" "}
        <span className="font-medium text-slate-900">
          {userName ?? "SMB user"}
        </span>
        {accountLabel ? (
          <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {accountLabel}
          </span>
        ) : null}
      </p>

      <div className="rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-slate-900">Active tenant</p>
          <button
            type="button"
            onClick={() => void loadSession()}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Reload session
          </button>
        </div>

        {tenants.length > 1 ? (
          <select
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={activeTenantId}
            disabled={isSaving}
            onChange={(e) => void selectContext({ tenantId: e.target.value })}
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name ? `${tenant.name} (${tenant.id})` : tenant.id}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-1 font-mono text-xs break-all text-slate-600">
            {activeTenantId
              ? `${activeTenantName ? `${activeTenantName} · ` : ""}${activeTenantId}`
              : "No tenant loaded yet"}
          </p>
        )}

        {!activeTenantId ? (
          <form onSubmit={handleManualTenant} className="mt-3 flex gap-2">
            <input
              value={manualTenantId}
              onChange={(e) => setManualTenantId(e.target.value)}
              placeholder="Paste tenant UUID"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-slate-500"
            />
            <button
              type="submit"
              disabled={isSaving || !manualTenantId.trim()}
              className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Use
            </button>
          </form>
        ) : null}
      </div>

      <div className="rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
        <p className="font-medium text-slate-900">Active company</p>
        {companies.length > 1 ? (
          <select
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={activeCompanyId}
            disabled={isSaving || !activeTenantId}
            onChange={(e) =>
              void selectContext({
                tenantId: activeTenantId,
                companyId: e.target.value,
              })
            }
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name ? `${company.name} (${company.id})` : company.id}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-1 font-mono text-xs break-all text-slate-600">
            {activeCompanyId
              ? `${activeCompanyName ? `${activeCompanyName} · ` : ""}${activeCompanyId}`
              : activeTenantId
                ? "No company loaded yet"
                : "Select a tenant first"}
          </p>
        )}

        {activeTenantId && !activeCompanyId ? (
          <form onSubmit={handleManualCompany} className="mt-3 flex gap-2">
            <input
              value={manualCompanyId}
              onChange={(e) => setManualCompanyId(e.target.value)}
              placeholder="Paste company UUID"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-slate-500"
            />
            <button
              type="submit"
              disabled={isSaving || !manualCompanyId.trim()}
              className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Use
            </button>
          </form>
        ) : null}
      </div>

      {warnings.length > 0 ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {warnings.map((warning) => (
            <p key={warning} className="break-all">
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      {debugRaw ? (
        <p className="break-all rounded bg-amber-50 px-2 py-1 font-mono text-[11px] text-amber-900">
          {debugRaw}
        </p>
      ) : null}

      {!activeTenantId ? (
        <p className="text-xs text-slate-500">
          You can still open AI Studio now. Paste a tenant UUID above if you need
          Brain / ReferenceData.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleOpenAiStudio}
          disabled={isOpening}
          className="rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
        >
          {isOpening ? "Opening…" : "Open AI Studio"}
        </button>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Refresh session
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Log out
        </button>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
