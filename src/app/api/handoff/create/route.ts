import { NextResponse } from "next/server";
import { createHandoff } from "@/lib/handoff-store";
import { assertBridgeProductionEnv } from "@/lib/env";
import { getSessionTokens } from "@/lib/session";

export async function POST() {
  try {
    assertBridgeProductionEnv();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Server misconfigured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!process.env.HANDOFF_SECRET?.trim()) {
    return NextResponse.json(
      { error: "HANDOFF_SECRET is required" },
      { status: 500 },
    );
  }

  const session = await getSessionTokens();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Tenant is optional for SSO. Platform accounts often have no memberships;
  // AI Studio still opens. Brain/ReferenceData needs a tenant later.
  try {
    const code = await createHandoff(session);
    const aiStudioUrl =
      process.env.AI_STUDIO_URL?.replace(/\/$/, "") ?? "http://localhost:3001";

    return NextResponse.json({
      url: `${aiStudioUrl}/sso?code=${encodeURIComponent(code)}`,
      warning: session.tenantId
        ? undefined
        : "Opened without a tenant. Paste a tenant UUID on SMB home for Brain/ReferenceData.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create handoff";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
