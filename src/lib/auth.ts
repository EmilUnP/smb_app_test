export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  userName?: string;
  tenantId?: string;
  tenantName?: string;
  companyId?: string;
  companyName?: string;
  accountType?: "tenant" | "platform" | "unknown";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** Support both plain string tokens and nested `{ token: "..." }` objects. */
function pickTokenValue(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;

    const nested = asRecord(value);
    if (nested) {
      const inner = pickString(nested, [
        "token",
        "Token",
        "value",
        "Value",
        "jwt",
        "Jwt",
        "accessToken",
        "AccessToken",
        "refreshToken",
        "RefreshToken",
      ]);
      if (inner) return inner;
    }
  }
  return undefined;
}

function candidateRoots(data: unknown): Record<string, unknown>[] {
  const root = asRecord(data);
  if (!root) return [];

  const roots: Record<string, unknown>[] = [root];
  for (const key of [
    "data",
    "Data",
    "result",
    "Result",
    "value",
    "Value",
    "payload",
    "Payload",
    "content",
    "Content",
    "tokens",
    "Tokens",
    "auth",
    "Auth",
    "authentication",
    "Authentication",
  ]) {
    const nested = asRecord(root[key]);
    if (nested) roots.push(nested);
  }
  return roots;
}

function isJwtLike(value: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

function collectJwtStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (isJwtLike(value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJwtStrings(item, out);
    return out;
  }
  const obj = asRecord(value);
  if (obj) {
    for (const item of Object.values(obj)) collectJwtStrings(item, out);
  }
  return out;
}

function summarizeKeys(value: unknown, depth = 0): unknown {
  if (depth > 3) return "...";
  if (typeof value === "string") {
    if (isJwtLike(value)) return `[jwt length=${value.length}]`;
    if (value.length > 24) return `[string length=${value.length}]`;
    return value;
  }
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 3).map((item) => summarizeKeys(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = summarizeKeys(item, depth + 1);
  }
  return out;
}

export function describeAuthPayload(data: unknown): string {
  try {
    return JSON.stringify(summarizeKeys(data));
  } catch {
    return String(data);
  }
}

/** Normalize SMB auth login/refresh payloads into a stable shape. */
export function normalizeAuthResponse(data: unknown): AuthTokens {
  const roots = candidateRoots(data);

  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let userName: string | undefined;

  for (const nested of roots) {
    accessToken ??= pickTokenValue(nested, [
      "accessToken",
      "AccessToken",
      "access_token",
      "access",
      "Access",
      "token",
      "Token",
      "jwt",
      "Jwt",
      "jwtToken",
      "JwtToken",
      "idToken",
      "IdToken",
      "bearerToken",
      "BearerToken",
    ]);

    refreshToken ??= pickTokenValue(nested, [
      "refreshToken",
      "RefreshToken",
      "refresh_token",
      "refresh",
      "Refresh",
      "refreshJwt",
      "RefreshJwt",
      "refreshJwtToken",
      "RefreshJwtToken",
    ]);

    const user = asRecord(nested.user) ?? asRecord(nested.User);
    userName ??=
      pickString(nested, [
        "userName",
        "UserName",
        "username",
        "Username",
        "name",
        "Name",
        "email",
        "Email",
      ]) ??
      (user
        ? pickString(user, [
            "userName",
            "UserName",
            "username",
            "Username",
            "name",
            "Name",
            "email",
            "Email",
          ])
        : undefined);
  }

  if (!accessToken || !refreshToken) {
    const jwts = collectJwtStrings(data);
    if (!accessToken && jwts[0]) accessToken = jwts[0];
    if (!refreshToken && jwts[1]) refreshToken = jwts[1];
  }

  if (!accessToken || !refreshToken) {
    throw new Error(
      `Auth response missing accessToken or refreshToken. Payload shape: ${describeAuthPayload(data)}`,
    );
  }

  return { accessToken, refreshToken, userName };
}

/** Best-effort extract of whatever token fields are present (never throws). */
export function extractPartialAuthTokens(data: unknown): Partial<AuthTokens> {
  try {
    return normalizeAuthResponse(data);
  } catch {
    // fall through and pick individually
  }

  const roots = candidateRoots(data);
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let userName: string | undefined;

  for (const nested of roots) {
    accessToken ??= pickTokenValue(nested, [
      "accessToken",
      "AccessToken",
      "access_token",
      "access",
      "Access",
      "token",
      "Token",
      "jwt",
      "Jwt",
      "jwtToken",
      "JwtToken",
      "idToken",
      "IdToken",
      "bearerToken",
      "BearerToken",
    ]);
    refreshToken ??= pickTokenValue(nested, [
      "refreshToken",
      "RefreshToken",
      "refresh_token",
      "refresh",
      "Refresh",
      "refreshJwt",
      "RefreshJwt",
    ]);
    userName ??= pickString(nested, [
      "userName",
      "UserName",
      "username",
      "Username",
      "name",
      "Name",
      "email",
      "Email",
    ]);
  }

  if (!accessToken) {
    const jwts = collectJwtStrings(data);
    if (jwts[0]) accessToken = jwts[0];
  }

  return { accessToken, refreshToken, userName };
}

export function tokensFromCookieHeader(
  setCookieHeaders: string[],
): Partial<AuthTokens> & { cookieNames?: string[] } {
  const jar: Record<string, string> = {};
  for (const header of setCookieHeaders) {
    const pair = header.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = decodeURIComponent(pair.slice(eq + 1).trim());
    jar[name] = value;
  }

  return {
    accessToken: pickString(jar, [
      "accessToken",
      "AccessToken",
      "access_token",
      "token",
      "Token",
      "jwt",
      "Jwt",
    ]),
    refreshToken: pickString(jar, [
      "refreshToken",
      "RefreshToken",
      "refresh_token",
    ]),
    cookieNames: Object.keys(jar),
  };
}
