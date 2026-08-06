import { assertHandoffStoreReady, handoffStoreMode } from "./handoff-store";

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

/** Fail fast in production before SSO / handoff routes serve traffic. */
export function assertBridgeProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  requireEnv("HANDOFF_SECRET");
  requireEnv("AI_STUDIO_URL");
  requireEnv("SMB_API_BASE");
  assertHandoffStoreReady();
}

export function bridgeEnvSummary(): {
  store: "upstash" | "memory";
  aiStudioUrl: string;
  smbApiBase: string;
  hasHandoffSecret: boolean;
} {
  return {
    store: handoffStoreMode(),
    aiStudioUrl:
      process.env.AI_STUDIO_URL?.replace(/\/$/, "") ?? "http://localhost:3001",
    smbApiBase:
      process.env.SMB_API_BASE?.replace(/\/$/, "") ?? "https://api.kob.sinam.az",
    hasHandoffSecret: Boolean(process.env.HANDOFF_SECRET?.trim()),
  };
}
