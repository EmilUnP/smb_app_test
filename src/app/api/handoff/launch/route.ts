import { NextRequest, NextResponse } from "next/server";
import { createHandoff } from "@/lib/handoff-store";
import { assertBridgeProductionEnv } from "@/lib/env";
import { getSessionTokens } from "@/lib/session";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Full-page launch: creates a sealed handoff code and auto-POSTs it to Studio /sso.
 * Using a real navigation (not fetch + JS form) avoids React canceling the submit.
 */
export async function GET(request: NextRequest) {
  try {
    assertBridgeProductionEnv();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Server misconfigured";
    return new NextResponse(message, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const session = await getSessionTokens();
  if (!session) {
    return NextResponse.redirect(
      new URL("/login?returnTo=ai-studio", request.url),
    );
  }

  try {
    const code = await createHandoff(session);
    const aiStudioUrl =
      process.env.AI_STUDIO_URL?.replace(/\/$/, "") ?? "http://localhost:3001";
    const action = `${aiStudioUrl}/sso`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Opening AI Studio…</title>
  <style>
    body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #0f172a; }
    p { color: #64748b; max-width: 28rem; text-align: center; }
    code { font-size: 0.8rem; word-break: break-all; }
    button { margin-top: 1rem; padding: 0.75rem 1.25rem; border-radius: 0.5rem; border: 0; background: #16a34a; color: white; font-weight: 600; cursor: pointer; font-size: 1rem; }
  </style>
</head>
<body>
  <main style="display:grid;place-items:center;gap:0.5rem;padding:1.5rem">
    <h1>Opening AI Studio…</h1>
    <p>Sending you to <code>${escapeHtml(action)}</code></p>
    <form id="sso" method="POST" action="${escapeHtml(action)}">
      <input type="hidden" name="code" value="${escapeHtml(code)}" />
      <button type="submit">Continue to AI Studio</button>
    </form>
  </main>
  <script>
    setTimeout(function () {
      document.getElementById("sso").submit();
    }, 50);
  </script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not open AI Studio";
    return new NextResponse(message, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
