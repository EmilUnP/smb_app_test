import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { Redis } from "@upstash/redis";
import type { AuthTokens } from "./auth";

type HandoffEntry = {
  tokens: AuthTokens;
  expiresAt: number;
};

type SignedPayload = {
  tokens: AuthTokens;
  exp: number;
  nonce: string;
};

type HandoffStore = Map<string, HandoffEntry>;

const globalForHandoff = globalThis as unknown as {
  __smbHandoffStore?: HandoffStore;
  __smbHandoffRedis?: Redis;
};

const TTL_SECONDS = 60;
const TTL_MS = TTL_SECONDS * 1000;
const KEY_PREFIX = "handoff:";

function hasUpstashEnv(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

function handoffSecret(): string {
  const secret = process.env.HANDOFF_SECRET?.trim();
  if (!secret) {
    throw new Error("HANDOFF_SECRET is required for SSO handoff");
  }
  return secret;
}

function aesKey(): Buffer {
  return createHash("sha256").update(handoffSecret()).digest();
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

/** Encrypt + authenticate tokens into a short-lived code (no Redis needed). */
function sealTokens(tokens: AuthTokens): string {
  const payload: SignedPayload = {
    tokens,
    exp: Date.now() + TTL_MS,
    nonce: randomBytes(8).toString("hex"),
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

function openSealedTokens(code: string): AuthTokens | null {
  const [ivB64, dataB64, tagB64] = code.split(".");
  if (!ivB64 || !dataB64 || !tagB64) return null;

  try {
    const iv = Buffer.from(ivB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", aesKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(plaintext) as SignedPayload;
    if (!payload?.tokens?.accessToken || !payload?.tokens?.refreshToken) {
      return null;
    }
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
      return null;
    }
    return payload.tokens;
  } catch {
    return null;
  }
}

/** Ready when HANDOFF_SECRET is set. Upstash is optional. */
export function assertHandoffStoreReady(): void {
  handoffSecret();
}

export function handoffStoreMode(): "upstash" | "signed" | "memory" {
  if (hasUpstashEnv()) return "upstash";
  if (process.env.NODE_ENV === "production") return "signed";
  return "memory";
}

export async function createHandoff(tokens: AuthTokens): Promise<string> {
  assertHandoffStoreReady();

  if (hasUpstashEnv()) {
    const code = randomBytes(24).toString("hex");
    await getRedis().set(`${KEY_PREFIX}${code}`, tokens, { ex: TTL_SECONDS });
    return code;
  }

  if (process.env.NODE_ENV === "production") {
    return sealTokens(tokens);
  }

  const code = randomBytes(24).toString("hex");
  getMemoryStore().set(code, { tokens, expiresAt: Date.now() + TTL_MS });
  return code;
}

export async function consumeHandoff(code: string): Promise<AuthTokens | null> {
  assertHandoffStoreReady();
  const trimmed = code.trim();
  if (!trimmed) return null;

  // Encrypted sealed code: iv.ciphertext.tag
  if (trimmed.split(".").length === 3) {
    return openSealedTokens(trimmed);
  }

  if (hasUpstashEnv()) {
    const tokens = await getRedis().getdel<AuthTokens>(
      `${KEY_PREFIX}${trimmed}`,
    );
    if (!tokens?.accessToken || !tokens?.refreshToken) return null;
    return tokens;
  }

  const store = getMemoryStore();
  const entry = store.get(trimmed);
  if (!entry) return null;
  store.delete(trimmed);
  if (Date.now() > entry.expiresAt) return null;
  return entry.tokens;
}
