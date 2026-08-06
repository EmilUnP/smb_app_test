import { NextResponse } from "next/server";
import { consumeHandoff } from "@/lib/handoff-store";
import { assertBridgeProductionEnv } from "@/lib/env";

export async function POST(request: Request) {
  try {
    assertBridgeProductionEnv();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Server misconfigured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const secret = request.headers.get("x-handoff-secret");
  if (!secret || secret !== process.env.HANDOFF_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { code?: string };
    const code = body.code?.trim();
    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }

    const tokens = await consumeHandoff(code);
    if (!tokens) {
      return NextResponse.json(
        { error: "Invalid or expired handoff code" },
        { status: 404 },
      );
    }

    return NextResponse.json(tokens);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bad request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
