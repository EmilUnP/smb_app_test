import { randomBytes } from "crypto";
import { Redis } from "@upstash/redis";
import type { AuthTokens } from "./auth";

type HandoffEntry = {
  tokens: AuthTokens;
  expiresAt: number;
};

type HandoffStore = Map<string, HandoffEntry>;

const globalForHandoff = globalThis as unknown as {
  __smbHandoffStore?: HandoffStore;
  __smbHandoffRedis?: Redis;
};

const TTL_SECONDS = 60;
const TTL_MS = TTL_SECONDS * 1000;
const KEY_PREFIX = "handoff:";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function hasUpstashEnv(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

function getMemoryStore(): HandoffStore {
  if (!globalForHandoff.__smbHandoffStore) {
    globalForHandoff.__smbHandoffStore = new Map();
  }
  return globalForHandoff.__smbHandoffStore;
}

function getRedis(): Redis {
  if (!globalForHandoff.__smbHandoffRedis) {
    globalForHandoff.__smbHandoffRedis = Redis.fromEnv();
  }
  return globalForHandoff.__smbHandoffRedis;
}

/** Production requires Upstash; local/dev may use in-memory when unset. */
export function assertHandoffStoreReady(): void {
  if (isProduction() && !hasUpstashEnv()) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production",
    );
  }
}

export function handoffStoreMode(): "upstash" | "memory" {
  return hasUpstashEnv() ? "upstash" : "memory";
}

export async function createHandoff(tokens: AuthTokens): Promise<string> {
  assertHandoffStoreReady();
  const code = randomBytes(24).toString("hex");

  if (hasUpstashEnv()) {
    await getRedis().set(`${KEY_PREFIX}${code}`, tokens, { ex: TTL_SECONDS });
    return code;
  }

  getMemoryStore().set(code, { tokens, expiresAt: Date.now() + TTL_MS });
  return code;
}

export async function consumeHandoff(code: string): Promise<AuthTokens | null> {
  assertHandoffStoreReady();

  if (hasUpstashEnv()) {
    const key = `${KEY_PREFIX}${code}`;
    const tokens = await getRedis().getdel<AuthTokens>(key);
    if (!tokens?.accessToken || !tokens?.refreshToken) return null;
    return tokens;
  }

  const store = getMemoryStore();
  const entry = store.get(code);
  if (!entry) return null;
  store.delete(code);
  if (Date.now() > entry.expiresAt) return null;
  return entry.tokens;
}
