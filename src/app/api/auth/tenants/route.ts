import { NextResponse } from "next/server";
import { bootstrapAuthSession } from "@/lib/smb-api";
import { getSessionTokens, setSessionCookies } from "@/lib/session";
import { summarizePayload } from "@/lib/tenants";

export async function GET() {
  const session = await getSessionTokens();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const boot = await bootstrapAuthSession(session);
    await setSessionCookies(boot.tokens);

    return NextResponse.json({
      tenantId: boot.tokens.tenantId ?? null,
      tenantName: boot.tokens.tenantName ?? null,
      companyId: boot.tokens.companyId ?? null,
      companyName: boot.tokens.companyName ?? null,
      accountType: boot.tokens.accountType ?? null,
      tenants: boot.tenants,
      companies: boot.companies,
      tenantSource: boot.tenantSource,
      isPlatformUser: boot.isPlatformUser,
      warnings: boot.warnings,
      hint:
        boot.isPlatformUser && !boot.tokens.tenantId
          ? "Platform account detected via /auth/platform/me. /auth/tenants is empty — paste a tenant UUID, then company can load."
          : null,
      context: boot.context ? summarizePayload(boot.context) : undefined,
      platformMe: boot.platformMe
        ? summarizePayload(boot.platformMe)
        : undefined,
      me: boot.me ? summarizePayload(boot.me) : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resolve session";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await getSessionTokens();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      tenantId?: string;
      companyId?: string;
    };

    const boot = await bootstrapAuthSession(session, {
      preferredTenantId: body.tenantId?.trim() || undefined,
      preferredCompanyId: body.companyId?.trim() || undefined,
    });
    await setSessionCookies(boot.tokens);

    return NextResponse.json({
      ok: true,
      tenantId: boot.tokens.tenantId ?? null,
      tenantName: boot.tokens.tenantName ?? null,
      companyId: boot.tokens.companyId ?? null,
      companyName: boot.tokens.companyName ?? null,
      tenants: boot.tenants,
      companies: boot.companies,
      warnings: boot.warnings,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to select tenant/company";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
