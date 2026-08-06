import { NextResponse } from "next/server";
import { smbLogout } from "@/lib/smb-api";
import { clearSessionCookies, getSessionTokens } from "@/lib/session";

export async function POST() {
  const session = await getSessionTokens();
  if (session?.accessToken) {
    await smbLogout(session.accessToken);
  }
  await clearSessionCookies();
  return NextResponse.json({ ok: true });
}
