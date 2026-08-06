import { NextResponse } from "next/server";
import { attachTenantAfterLogin, smbLogin } from "@/lib/smb-api";
import { setSessionCookies } from "@/lib/session";
import { summarizePayload } from "@/lib/tenants";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userName?: string;
      UserName?: string;
      password?: string;
      Password?: string;
    };

    const userName = (body.userName ?? body.UserName ?? "").trim();
    const password = body.password ?? body.Password ?? "";

    if (!userName || !password) {
      return NextResponse.json(
        { error: "UserName and Password are required" },
        { status: 400 },
      );
    }

    let tokens = await smbLogin(userName, password);
    if (!tokens.userName) tokens.userName = userName;

    const boot = await attachTenantAfterLogin(tokens);
    tokens = boot.tokens;
    await setSessionCookies(tokens);

    return NextResponse.json({
      ok: true,
      userName: tokens.userName,
      tenantId: tokens.tenantId ?? null,
      tenantName: tokens.tenantName ?? null,
      companyId: tokens.companyId ?? null,
      companyName: tokens.companyName ?? null,
      accountType: tokens.accountType ?? null,
      tenants: boot.tenants,
      companies: boot.companies,
      tenantSource: boot.tenantSource,
      isPlatformUser: boot.isPlatformUser,
      warnings: boot.warnings,
      context: boot.context ? summarizePayload(boot.context) : undefined,
      platformMe: boot.platformMe
        ? summarizePayload(boot.platformMe)
        : undefined,
      me: boot.me ? summarizePayload(boot.me) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
