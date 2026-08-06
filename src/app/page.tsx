import { redirect } from "next/navigation";
import { getSessionTokens } from "@/lib/session";
import HomeActions from "./HomeActions";

type Props = {
  searchParams?: Promise<{ sso?: string; reason?: string }>;
};

function ssoReasonHint(reason?: string): string {
  switch (reason) {
    case "secret_mismatch":
      return "HANDOFF_SECRET does not match on both Vercel apps.";
    case "missing_handoff_secret":
      return "Set HANDOFF_SECRET on the AI Studio Vercel project.";
    case "missing_smb_app_url":
      return "Set SMB_APP_URL=https://smb-app-test.vercel.app on AI Studio.";
    case "invalid_or_expired_code":
      return "Handoff code invalid/expired — click Open AI Studio again.";
    case "consume_network_error":
      return "Studio could not reach this bridge /api/handoff/consume.";
    case "missing_code":
      return "No handoff code reached Studio (URL too long or POST blocked).";
    default:
      return reason
        ? `Reason: ${reason}`
        : "Stay signed in and click Open AI Studio again.";
  }
}

export default async function HomePage({ searchParams }: Props) {
  const session = await getSessionTokens();
  if (!session) {
    redirect("/login");
  }

  const params = searchParams ? await searchParams : {};
  const ssoFailed = params.sso === "failed";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-12">
      <p className="mb-2 text-sm font-medium tracking-wide text-slate-500 uppercase">
        SMB App · SSO bridge
      </p>
      <h1 className="mb-2 text-3xl font-semibold text-slate-900">
        Main application
      </h1>
      <p className="text-slate-600">
        Uses current SMB Auth flow: context → tenant → company. Open AI Studio
        without a second login.
      </p>

      {ssoFailed ? (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          AI Studio SSO handoff failed. {ssoReasonHint(params.reason)}
        </p>
      ) : null}

      <HomeActions
        userName={session.userName}
        tenantId={session.tenantId}
        tenantName={session.tenantName}
        companyId={session.companyId}
        companyName={session.companyName}
        accountType={session.accountType}
      />
    </main>
  );
}
