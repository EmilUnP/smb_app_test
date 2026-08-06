export type SmbEntity = {
  id: string;
  name?: string;
};

export type SmbTenant = SmbEntity;
export type SmbCompany = SmbEntity;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function looksLikeId(value: string): boolean {
  return UUID_RE.test(value) || value.length >= 8;
}

function normalizeEntity(
  item: unknown,
  idKeys: string[],
  nameKeys: string[],
): SmbEntity | null {
  if (typeof item === "string" && looksLikeId(item)) {
    return { id: item };
  }

  const obj = asRecord(item);
  if (!obj) return null;

  const id = pickString(obj, idKeys);
  if (!id || !looksLikeId(id)) return null;

  const name = pickString(obj, nameKeys);
  return { id, name };
}

function collectArrays(value: unknown, out: unknown[][], depth = 0): void {
  if (depth > 5 || value == null) return;
  if (Array.isArray(value)) {
    out.push(value);
    for (const item of value) collectArrays(item, out, depth + 1);
    return;
  }
  const obj = asRecord(value);
  if (!obj) return;
  for (const item of Object.values(obj)) collectArrays(item, out, depth + 1);
}

function extractEntities(
  data: unknown,
  idKeys: string[],
  nameKeys: string[],
  preferredArrayKeys: string[],
): SmbEntity[] {
  const out: SmbEntity[] = [];
  const seen = new Set<string>();

  const push = (entity: SmbEntity | null) => {
    if (!entity || seen.has(entity.id)) return;
    seen.add(entity.id);
    out.push(entity);
  };

  if (Array.isArray(data)) {
    for (const item of data) push(normalizeEntity(item, idKeys, nameKeys));
    if (out.length > 0) return out;
  }

  const root = asRecord(data);
  if (root) {
    for (const key of preferredArrayKeys) {
      const value = root[key];
      if (Array.isArray(value)) {
        for (const item of value) push(normalizeEntity(item, idKeys, nameKeys));
      } else {
        push(normalizeEntity(value, idKeys, nameKeys));
      }
    }
    push(normalizeEntity(root, idKeys, nameKeys));
  }

  if (out.length === 0) {
    const arrays: unknown[][] = [];
    collectArrays(data, arrays);
    for (const arr of arrays) {
      for (const item of arr) push(normalizeEntity(item, idKeys, nameKeys));
    }
  }

  return out;
}

export function extractTenants(data: unknown): SmbTenant[] {
  return extractEntities(
    data,
    [
      "id",
      "Id",
      "tenantId",
      "TenantId",
      "tenant_id",
      "tenantGuid",
      "TenantGuid",
      "guid",
      "Guid",
      "key",
      "Key",
      "value",
      "Value",
    ],
    [
      "name",
      "Name",
      "tenantName",
      "TenantName",
      "displayName",
      "DisplayName",
      "title",
      "Title",
      "code",
      "Code",
      "label",
      "Label",
    ],
    [
      "data",
      "Data",
      "items",
      "Items",
      "result",
      "Result",
      "results",
      "Results",
      "tenants",
      "Tenants",
      "accessibleTenants",
      "AccessibleTenants",
      "memberships",
      "Memberships",
      "value",
      "Value",
      "content",
      "Content",
      "tenant",
      "Tenant",
    ],
  );
}

export function extractCompanies(data: unknown): SmbCompany[] {
  return extractEntities(
    data,
    [
      "id",
      "Id",
      "companyId",
      "CompanyId",
      "company_id",
      "guid",
      "Guid",
      "key",
      "Key",
      "value",
      "Value",
    ],
    [
      "name",
      "Name",
      "companyName",
      "CompanyName",
      "displayName",
      "DisplayName",
      "title",
      "Title",
      "code",
      "Code",
      "label",
      "Label",
    ],
    [
      "data",
      "Data",
      "items",
      "Items",
      "result",
      "Result",
      "results",
      "Results",
      "companies",
      "Companies",
      "accessibleCompanies",
      "AccessibleCompanies",
      "value",
      "Value",
      "content",
      "Content",
      "company",
      "Company",
    ],
  );
}

/** Pull tenant/company hints from GET /auth/context payload. */
export function extractContextSelection(data: unknown): {
  tenantId?: string;
  tenantName?: string;
  companyId?: string;
  companyName?: string;
  userName?: string;
} {
  const root = asRecord(data) ?? {};
  const nested =
    asRecord(root.data) ??
    asRecord(root.result) ??
    asRecord(root.context) ??
    asRecord(root.Context) ??
    root;

  const tenantObj =
    asRecord(nested.tenant) ??
    asRecord(nested.Tenant) ??
    asRecord(nested.activeTenant) ??
    asRecord(nested.ActiveTenant);
  const companyObj =
    asRecord(nested.company) ??
    asRecord(nested.Company) ??
    asRecord(nested.activeCompany) ??
    asRecord(nested.ActiveCompany);
  const userObj =
    asRecord(nested.user) ??
    asRecord(nested.User) ??
    asRecord(nested.currentUser) ??
    asRecord(nested.CurrentUser);

  const tenantId =
    pickString(nested, ["tenantId", "TenantId", "tenant_id", "activeTenantId"]) ??
    (tenantObj
      ? pickString(tenantObj, ["id", "Id", "tenantId", "TenantId"])
      : undefined);
  const tenantName =
    pickString(nested, ["tenantName", "TenantName"]) ??
    (tenantObj
      ? pickString(tenantObj, ["name", "Name", "tenantName", "code", "Code"])
      : undefined);
  const companyId =
    pickString(nested, [
      "companyId",
      "CompanyId",
      "company_id",
      "activeCompanyId",
    ]) ??
    (companyObj
      ? pickString(companyObj, ["id", "Id", "companyId", "CompanyId"])
      : undefined);
  const companyName =
    pickString(nested, ["companyName", "CompanyName"]) ??
    (companyObj
      ? pickString(companyObj, ["name", "Name", "companyName", "code", "Code"])
      : undefined);
  const userName =
    pickString(nested, ["userName", "UserName", "username"]) ??
    (userObj
      ? pickString(userObj, [
          "userName",
          "UserName",
          "username",
          "name",
          "Name",
          "email",
          "Email",
        ])
      : undefined);

  return { tenantId, tenantName, companyId, companyName, userName };
}

export function summarizePayload(data: unknown, depth = 0): unknown {
  if (depth > 4) return "...";
  if (typeof data === "string") {
    if (UUID_RE.test(data)) return "[uuid]";
    if (data.length > 40) return `[string length=${data.length}]`;
    return data;
  }
  if (typeof data !== "object" || data === null) return data;
  if (Array.isArray(data)) {
    return data.slice(0, 5).map((item) => summarizePayload(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = summarizePayload(value, depth + 1);
  }
  return out;
}

/** @deprecated use summarizePayload */
export const summarizeTenantPayload = summarizePayload;

export function tenantsFromJwt(accessToken: string): SmbTenant[] {
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return [];
    const json = Buffer.from(
      payloadPart.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const payload = JSON.parse(json) as Record<string, unknown>;
    const direct = pickString(payload, [
      "tenantId",
      "TenantId",
      "tenant_id",
      "tid",
      "tenant",
    ]);
    if (direct && looksLikeId(direct)) return [{ id: direct }];
    return extractTenants(payload);
  } catch {
    return [];
  }
}
