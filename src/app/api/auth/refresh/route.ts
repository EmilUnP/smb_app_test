import { NextResponse } from "next/server";
import { smbRefresh } from "@/lib/smb-api";
import {
  clearSessionCookies,
  getSessionTokens,
  setSessionCookies,
} from "@/lib/session";

export async function POST() {
  try {
    const session = await getSessionTokens();
    if (!session?.refreshToken) {
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    const tokens = await smbRefresh(session.refreshToken);
    await setSessionCookies({
      ...tokens,
      userName: tokens.userName ?? session.userName,
      tenantId: session.tenantId,
      tenantName: session.tenantName,
      companyId: session.companyId,
      companyName: session.companyName,
      accountType: session.accountType,
    });

    return NextResponse.json({
      ok: true,
      userName: tokens.userName ?? session.userName ?? null,
      tenantId: session.tenantId ?? null,
      companyId: session.companyId ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    const invalid =
      /invalid refresh|refresh failed|missing from the|no session/i.test(
        message,
      );
    if (invalid) {
      await clearSessionCookies();
    }
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
