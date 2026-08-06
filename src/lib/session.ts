import { cookies } from "next/headers";
import type { AuthTokens } from "./auth";

export const COOKIE_ACCESS = "smb_access_token";
export const COOKIE_REFRESH = "smb_refresh_token";
export const COOKIE_USER = "smb_user_name";
export const COOKIE_TENANT_ID = "smb_tenant_id";
export const COOKIE_TENANT_NAME = "smb_tenant_name";
export const COOKIE_COMPANY_ID = "smb_company_id";
export const COOKIE_COMPANY_NAME = "smb_company_name";
export const COOKIE_ACCOUNT_TYPE = "smb_account_type";

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

function setOptional(
  jar: Awaited<ReturnType<typeof cookies>>,
  name: string,
  value: string | undefined,
  httpOnly = false,
) {
  if (value) {
    jar.set(name, value, {
      ...cookieBase,
      httpOnly,
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    jar.set(name, "", { ...cookieBase, httpOnly, maxAge: 0 });
  }
}

export async function setSessionCookies(tokens: AuthTokens): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_ACCESS, tokens.accessToken, {
    ...cookieBase,
    maxAge: 60 * 60,
  });
  jar.set(COOKIE_REFRESH, tokens.refreshToken, {
    ...cookieBase,
    maxAge: 60 * 60 * 24 * 30,
  });
  setOptional(jar, COOKIE_USER, tokens.userName, false);
  setOptional(jar, COOKIE_TENANT_ID, tokens.tenantId, false);
  setOptional(jar, COOKIE_TENANT_NAME, tokens.tenantName, false);
  setOptional(jar, COOKIE_COMPANY_ID, tokens.companyId, false);
  setOptional(jar, COOKIE_COMPANY_NAME, tokens.companyName, false);
  setOptional(jar, COOKIE_ACCOUNT_TYPE, tokens.accountType, false);
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();
  for (const name of [
    COOKIE_ACCESS,
    COOKIE_REFRESH,
    COOKIE_USER,
    COOKIE_TENANT_ID,
    COOKIE_TENANT_NAME,
    COOKIE_COMPANY_ID,
    COOKIE_COMPANY_NAME,
    COOKIE_ACCOUNT_TYPE,
  ]) {
    jar.set(name, "", {
      ...cookieBase,
      httpOnly: name === COOKIE_ACCESS || name === COOKIE_REFRESH,
      maxAge: 0,
    });
  }
}

export async function getSessionTokens(): Promise<AuthTokens | null> {
  const jar = await cookies();
  const accessToken = jar.get(COOKIE_ACCESS)?.value;
  const refreshToken = jar.get(COOKIE_REFRESH)?.value;
  if (!accessToken || !refreshToken) return null;

  const accountType = jar.get(COOKIE_ACCOUNT_TYPE)?.value;
  return {
    accessToken,
    refreshToken,
    userName: jar.get(COOKIE_USER)?.value,
    tenantId: jar.get(COOKIE_TENANT_ID)?.value,
    tenantName: jar.get(COOKIE_TENANT_NAME)?.value,
    companyId: jar.get(COOKIE_COMPANY_ID)?.value,
    companyName: jar.get(COOKIE_COMPANY_NAME)?.value,
    accountType:
      accountType === "tenant" ||
      accountType === "platform" ||
      accountType === "unknown"
        ? accountType
        : undefined,
  };
}
