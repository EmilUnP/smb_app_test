import {
  describeAuthPayload,
  extractPartialAuthTokens,
  tokensFromCookieHeader,
  type AuthTokens,
} from "./auth";
import {
  extractCompanies,
  extractContextSelection,
  extractTenants,
  tenantsFromJwt,
  type SmbCompany,
  type SmbTenant,
} from "./tenants";

const SMB_API_BASE =
  process.env.SMB_API_BASE?.replace(/\/$/, "") ?? "https://api.kob.sinam.az";

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function getSetCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

function authErrorDetail(data: unknown, status: number): string {
  if (typeof data === "object" && data) {
    const record = data as {
      detail?: unknown;
      title?: unknown;
      errors?: unknown;
    };

    if (Array.isArray(record.errors)) {
      const parts = record.errors
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const err = item as { property?: unknown; message?: unknown };
          if (typeof err.message === "string") {
            return typeof err.property === "string"
              ? `${err.property}: ${err.message}`
              : err.message;
          }
          return null;
        })
        .filter((part): part is string => Boolean(part));
      if (parts.length) return parts.join("; ");
    }

    if (typeof record.detail === "string" && record.detail.trim()) {
      return record.detail;
    }
    if (typeof record.title === "string" && record.title.trim()) {
      return record.title;
    }
  }
  return `Request failed (${status})`;
}

function combineTokens(
  parts: Array<Partial<AuthTokens> | null | undefined>,
  fallbackRefresh?: string,
): AuthTokens | null {
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let userName: string | undefined;

  for (const part of parts) {
    if (!part) continue;
    accessToken ??= part.accessToken;
    refreshToken ??= part.refreshToken;
    userName ??= part.userName;
  }

  refreshToken ??= fallbackRefresh;
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, userName };
}

async function parseAuthResponse(
  res: Response,
  data: unknown,
  fallbackRefresh?: string,
): Promise<AuthTokens> {
  const fromBody = extractPartialAuthTokens(data);
  const fromCookies = tokensFromCookieHeader(getSetCookies(res));
  const combined = combineTokens([fromBody, fromCookies], fallbackRefresh);
  if (combined) return combined;
  throw new Error(
    `Auth response missing accessToken or refreshToken. Body: ${describeAuthPayload(data)} Cookies: ${describeAuthPayload(fromCookies)} Cookie names: ${(fromCookies.cookieNames ?? []).join(",") || "(none)"}`,
  );
}

function mergeSessionFields(
  base: AuthTokens,
  extra: Partial<AuthTokens>,
): AuthTokens {
  return {
    ...base,
    userName: extra.userName ?? base.userName,
    tenantId: extra.tenantId ?? base.tenantId,
    tenantName: extra.tenantName ?? base.tenantName,
    companyId: extra.companyId ?? base.companyId,
    companyName: extra.companyName ?? base.companyName,
    accountType: extra.accountType ?? base.accountType,
  };
}

async function withAuthRetry<T>(
  tokens: AuthTokens,
  run: (accessToken: string) => Promise<T>,
): Promise<{ tokens: AuthTokens; result: T }> {
  try {
    const result = await run(tokens.accessToken);
    return { tokens, result };
  } catch (error) {
    const status =
      typeof error === "object" &&
      error &&
      "status" in error &&
      typeof (error as { status: unknown }).status === "number"
        ? (error as { status: number }).status
        : 0;
    if (status !== 401) throw error;

    const refreshed = await smbRefresh(tokens.refreshToken);
    const next = mergeSessionFields(refreshed, tokens);
    const result = await run(next.accessToken);
    return { tokens: next, result };
  }
}

function asHttpError(
  message: string,
  status: number,
  raw?: unknown,
): Error & { status: number; raw?: unknown } {
  const err = new Error(message) as Error & { status: number; raw?: unknown };
  err.status = status;
  err.raw = raw;
  return err;
}

export async function smbLogin(
  userName: string,
  password: string,
): Promise<AuthTokens> {
  // SMB auth DTOs bind PascalCase JSON (UserName/Password). camelCase returns Bad request.
  const res = await fetch(`${SMB_API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ UserName: userName, Password: password }),
    cache: "no-store",
  });

  const data = await readJson(res);
  if (!res.ok) throw new Error(authErrorDetail(data, res.status));

  const fromBody = extractPartialAuthTokens(data);
  const fromCookies = tokensFromCookieHeader(getSetCookies(res));
  const direct = combineTokens([fromBody, fromCookies]);
  if (direct) return { ...direct, userName: direct.userName ?? userName };

  const refreshToken = fromBody.refreshToken ?? fromCookies.refreshToken;
  if (!refreshToken) {
    throw new Error(
      `Auth response missing refreshToken after login. Body: ${describeAuthPayload(data)} Cookies: ${describeAuthPayload(fromCookies)}`,
    );
  }

  const refreshed = await smbRefresh(refreshToken);
  return { ...refreshed, userName: refreshed.userName ?? userName };
}

const refreshFlights = new Map<string, Promise<AuthTokens>>();

function singleFlightRefresh(
  key: string,
  run: () => Promise<AuthTokens>,
): Promise<AuthTokens> {
  const existing = refreshFlights.get(key);
  if (existing) return existing;
  const pending = run().finally(() => {
    if (refreshFlights.get(key) === pending) refreshFlights.delete(key);
  });
  refreshFlights.set(key, pending);
  return pending;
}

/**
 * SMB refresh reads the token from cookie `refresh_token` (not JSON body).
 * Concurrent callers with the same token share one SMB request.
 */
export async function smbRefresh(refreshToken: string): Promise<AuthTokens> {
  const token = refreshToken.trim();
  if (!token) {
    throw new Error("Refresh token is missing from the session.");
  }

  return singleFlightRefresh(token, async () => {
    const res = await fetch(`${SMB_API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Cookie: `refresh_token=${encodeURIComponent(token)}`,
      },
      cache: "no-store",
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(authErrorDetail(data, res.status));
    return parseAuthResponse(res, data, token);
  });
}

export async function smbLogout(accessToken?: string): Promise<void> {
  try {
    await fetch(`${SMB_API_BASE}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      cache: "no-store",
    });
  } catch {
    // Local logout must still succeed even if remote logout fails.
  }
}

export async function smbGetAuthContext(accessToken: string): Promise<unknown> {
  const res = await fetch(`${SMB_API_BASE}/api/v1/auth/context`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok) throw asHttpError(authErrorDetail(data, res.status), res.status, data);
  return data;
}

export async function smbListTenants(accessToken: string): Promise<{
  tenants: SmbTenant[];
  raw: unknown;
  source: "api" | "jwt" | "empty";
}> {
  const res = await fetch(`${SMB_API_BASE}/api/v1/auth/tenants`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok) throw asHttpError(authErrorDetail(data, res.status), res.status, data);

  let tenants = extractTenants(data);
  if (tenants.length > 0) return { tenants, raw: data, source: "api" };

  tenants = tenantsFromJwt(accessToken);
  if (tenants.length > 0) return { tenants, raw: data, source: "jwt" };
  return { tenants: [], raw: data, source: "empty" };
}

export async function smbSelectTenant(
  accessToken: string,
  tenantId: string,
): Promise<void> {
  const attempt = async (body: Record<string, string>) => {
    const res = await fetch(`${SMB_API_BASE}/api/v1/auth/tenant/select`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await readJson(res);
    return { res, data };
  };

  let { res, data } = await attempt({ tenantId });
  if (!res.ok) ({ res, data } = await attempt({ TenantId: tenantId }));
  if (!res.ok) throw asHttpError(authErrorDetail(data, res.status), res.status, data);
}

export async function smbListCompanies(
  accessToken: string,
  tenantId: string,
): Promise<{ companies: SmbCompany[]; raw: unknown }> {
  const res = await fetch(`${SMB_API_BASE}/api/v1/auth/companies`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Id": tenantId,
    },
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok) throw asHttpError(authErrorDetail(data, res.status), res.status, data);
  return { companies: extractCompanies(data), raw: data };
}

export async function smbSelectCompany(
  accessToken: string,
  tenantId: string,
  companyId: string,
): Promise<void> {
  const res = await fetch(`${SMB_API_BASE}/api/v1/auth/company/select`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Id": tenantId,
    },
    body: JSON.stringify({ companyId }),
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok) throw asHttpError(authErrorDetail(data, res.status), res.status, data);
}

export async function smbGetPlatformMe(accessToken: string): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
}> {
  const res = await fetch(`${SMB_API_BASE}/api/v1/auth/platform/me`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  return { ok: res.ok, status: res.status, data: await readJson(res) };
}

export async function smbGetMe(
  accessToken: string,
  tenantId: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${SMB_API_BASE}/api/v1/auth/me`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Id": tenantId,
    },
    cache: "no-store",
  });
  return { ok: res.ok, status: res.status, data: await readJson(res) };
}

export type SessionBootstrapResult = {
  tokens: AuthTokens;
  tenants: SmbTenant[];
  companies: SmbCompany[];
  context?: unknown;
  platformMe?: unknown;
  me?: unknown;
  isPlatformUser: boolean;
  warnings: string[];
  tenantSource: "context" | "api" | "jwt" | "empty" | "manual" | "error";
};

/**
 * Stable SMB auth bootstrap aligned with current Auth tag:
 * context → tenants → tenant/select → companies → company/select → me/platform/me
 */
export async function bootstrapAuthSession(
  tokens: AuthTokens,
  options?: { preferredTenantId?: string; preferredCompanyId?: string },
): Promise<SessionBootstrapResult> {
  const warnings: string[] = [];
  let current = tokens;
  let tenants: SmbTenant[] = [];
  let companies: SmbCompany[] = [];
  let context: unknown;
  let tenantSource: SessionBootstrapResult["tenantSource"] = "empty";

  // 1) Auth context (new)
  try {
    const ran = await withAuthRetry(current, (access) => smbGetAuthContext(access));
    current = ran.tokens;
    context = ran.result;
    const fromContext = extractContextSelection(context);
    current = mergeSessionFields(current, {
      userName: fromContext.userName ?? current.userName,
      tenantId: fromContext.tenantId,
      tenantName: fromContext.tenantName,
      companyId: fromContext.companyId,
      companyName: fromContext.companyName,
    });
    if (fromContext.tenantId) tenantSource = "context";
  } catch (error) {
    warnings.push(
      `GET /auth/context failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  // 2) Platform identity probe
  let platformMe: unknown;
  let isPlatformUser = false;
  try {
    const ran = await withAuthRetry(current, (access) => smbGetPlatformMe(access));
    current = ran.tokens;
    isPlatformUser = ran.result.ok;
    platformMe = ran.result.ok ? ran.result.data : undefined;
    if (isPlatformUser) current.accountType = "platform";
  } catch {
    // ignore
  }

  // 3) Tenants list + select
  try {
    const ran = await withAuthRetry(current, (access) => smbListTenants(access));
    current = ran.tokens;
    tenants = ran.result.tenants;
    if (tenants.length > 0 && tenantSource === "empty") {
      tenantSource = ran.result.source;
    }
  } catch (error) {
    tenantSource = "error";
    warnings.push(
      `GET /auth/tenants failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  const preferredTenant =
    options?.preferredTenantId ||
    current.tenantId ||
    tenants[0]?.id;

  if (preferredTenant) {
    const match = tenants.find((t) => t.id === preferredTenant);
    try {
      const ran = await withAuthRetry(current, (access) =>
        smbSelectTenant(access, preferredTenant),
      );
      current = ran.tokens;
    } catch (error) {
      warnings.push(
        `POST /auth/tenant/select failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
    current = mergeSessionFields(current, {
      tenantId: preferredTenant,
      tenantName: match?.name ?? current.tenantName,
      accountType: isPlatformUser ? "platform" : "tenant",
    });
    if (!tenants.some((t) => t.id === preferredTenant)) {
      tenants = [{ id: preferredTenant, name: current.tenantName }, ...tenants];
      if (options?.preferredTenantId) tenantSource = "manual";
    }
  } else if (isPlatformUser) {
    warnings.push(
      "Platform account has no tenant memberships. Paste a tenant UUID to continue.",
    );
  }

  // 4) Companies list + select (requires tenant)
  if (current.tenantId) {
    try {
      const ran = await withAuthRetry(current, (access) =>
        smbListCompanies(access, current.tenantId!),
      );
      current = ran.tokens;
      companies = ran.result.companies;
    } catch (error) {
      warnings.push(
        `GET /auth/companies failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }

    const preferredCompany =
      options?.preferredCompanyId ||
      current.companyId ||
      companies[0]?.id;

    if (preferredCompany) {
      const match = companies.find((c) => c.id === preferredCompany);
      try {
        const ran = await withAuthRetry(current, (access) =>
          smbSelectCompany(access, current.tenantId!, preferredCompany),
        );
        current = ran.tokens;
      } catch (error) {
        warnings.push(
          `POST /auth/company/select failed: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
      current = mergeSessionFields(current, {
        companyId: preferredCompany,
        companyName: match?.name ?? current.companyName,
      });
      if (!companies.some((c) => c.id === preferredCompany)) {
        companies = [
          { id: preferredCompany, name: current.companyName },
          ...companies,
        ];
      }
    }
  }

  // 5) /auth/me when tenant is known
  let me: unknown;
  if (current.tenantId) {
    try {
      const ran = await withAuthRetry(current, (access) =>
        smbGetMe(access, current.tenantId!),
      );
      current = ran.tokens;
      if (ran.result.ok) {
        me = ran.result.data;
        const fromMe = extractContextSelection(ran.result.data);
        current = mergeSessionFields(current, {
          userName: fromMe.userName ?? current.userName,
        });
      } else {
        warnings.push(`GET /auth/me failed (${ran.result.status})`);
      }
    } catch (error) {
      warnings.push(
        `GET /auth/me failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  if (!current.accountType) {
    current.accountType = isPlatformUser ? "platform" : current.tenantId ? "tenant" : "unknown";
  }

  return {
    tokens: current,
    tenants,
    companies,
    context,
    platformMe,
    me,
    isPlatformUser,
    warnings,
    tenantSource,
  };
}

/** Back-compat aliases used by older routes. */
export async function resolveTenantsForSession(tokens: AuthTokens) {
  const boot = await bootstrapAuthSession(tokens);
  return {
    tokens: boot.tokens,
    tenants: boot.tenants,
    raw: boot.context ?? null,
    source: boot.tenantSource === "manual" ? "api" : boot.tenantSource,
    platformMe: boot.platformMe,
    isPlatformUser: boot.isPlatformUser,
    error: boot.warnings[0],
    companies: boot.companies,
    context: boot.context,
    me: boot.me,
    warnings: boot.warnings,
  };
}

export async function attachTenantAfterLogin(tokens: AuthTokens) {
  return bootstrapAuthSession(tokens);
}
