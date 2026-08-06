import { redirect } from "next/navigation";
import { getSessionTokens } from "@/lib/session";
import HomeActions from "./HomeActions";

type Props = {
  searchParams?: Promise<{ sso?: string }>;
};

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
        SMB App · port 3000
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
          AI Studio SSO handoff failed. Stay signed in and click{" "}
          <span className="font-medium">Open AI Studio</span> again.
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
