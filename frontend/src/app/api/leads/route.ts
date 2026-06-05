import { createHash, createHmac } from "node:crypto";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";

const DIRECTUS_INTERNAL_URL =
  process.env.DIRECTUS_INTERNAL_URL?.trim() ||
  process.env.DIRECTUS_URL?.trim() ||
  process.env.NEXT_PUBLIC_DIRECTUS_URL?.trim() ||
  (process.env.NODE_ENV !== "production" ? "http://localhost:8055" : "");
const DIRECTUS_LEADS_COLLECTION = process.env.DIRECTUS_LEADS_COLLECTION?.trim() || "leads";
const DIRECTUS_LEADS_TOKEN =
  process.env.DIRECTUS_LEADS_TOKEN?.trim() ||
  process.env.DIRECTUS_API_TOKEN?.trim() ||
  process.env.DIRECTUS_TOKEN?.trim() ||
  "";
const DIRECTUS_WRITE_TIMEOUT_MS = Number.parseInt(process.env.DIRECTUS_WRITE_TIMEOUT_MS || "10000", 10);

const CRM_SITE_INGEST_URL = process.env.CRM_SITE_INGEST_URL?.trim() || "";
const CRM_SITE_SECRET = process.env.CRM_SITE_SECRET?.trim() || "";
const CRM_SITE_EXTERNAL_ID_PREFIX = process.env.CRM_SITE_EXTERNAL_ID_PREFIX?.trim() || "katet.tech";
const CRM_SITE_ALLOW_UNSIGNED = (process.env.CRM_SITE_ALLOW_UNSIGNED || "").toLowerCase() === "true";

type IngestResult = {
  ok: boolean;
  skipped: boolean;
  reason: string | null;
};

type LeadFields = {
  phone: string;
  name: string;
  email: string;
  company: string;
  message: string;
  formName: string;
  sourcePath: string | null;
  referer: string | null;
  payload: Record<string, string>;
};

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function toJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function directusItemsUrl() {
  if (!DIRECTUS_INTERNAL_URL) return "";
  const baseUrl = DIRECTUS_INTERNAL_URL.replace(/\/$/, "");
  return `${baseUrl}/items/${encodeURIComponent(DIRECTUS_LEADS_COLLECTION)}`;
}

function directusWriteTimeoutMs() {
  if (!Number.isFinite(DIRECTUS_WRITE_TIMEOUT_MS) || DIRECTUS_WRITE_TIMEOUT_MS < 1000) {
    return 10000;
  }

  return DIRECTUS_WRITE_TIMEOUT_MS;
}

function textField(formData: FormData, ...keys: string[]) {
  for (const key of keys) {
    const value = formData.get(key);
    if (!value) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return "";
}

function mapFormPayload(formData: FormData) {
  const payload: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    payload[key] = typeof value === "string" ? value : value.name;
  }
  return payload;
}

function normalizeLeadFields(formData: FormData, referer: string | null): LeadFields {
  const payload = mapFormPayload(formData);
  const phone = textField(formData, "phone", "tel", "contact_phone");
  const name = textField(formData, "name", "contact_name", "full_name");
  const email = textField(formData, "email", "contact_email");
  const company = textField(formData, "company", "organization", "contact_company");
  const message = textField(formData, "message", "comment", "note");
  const formName = textField(formData, "form_name") || "Сайт";

  let sourcePath: string | null = null;
  if (referer) {
    try {
      sourcePath = new URL(referer).pathname;
    } catch {
      sourcePath = null;
    }
  }

  return {
    phone,
    name,
    email,
    company,
    message,
    formName,
    sourcePath,
    referer,
    payload,
  };
}

function buildCrmExternalId(fields: LeadFields) {
  const hashSource = JSON.stringify({
    phone: fields.phone,
    formName: fields.formName,
    sourcePath: fields.sourcePath,
    message: fields.message,
    timestampBucket: Math.floor(Date.now() / 1000),
  });
  const digest = createHash("sha256").update(hashSource).digest("hex").slice(0, 16);
  return `${CRM_SITE_EXTERNAL_ID_PREFIX}:${digest}`;
}

function buildCrmPayload(fields: LeadFields) {
  const contactName = fields.name || fields.company || `Заявка с сайта (${fields.formName})`;
  const equipmentType = fields.payload.equipment_type?.trim() || "";
  const requestedDate = fields.payload.pickup_date?.trim() || "";

  return {
    contactName,
    contactPhone: fields.phone,
    contactCompany: fields.company || undefined,
    equipmentTypeHint: equipmentType || undefined,
    requestedDate: requestedDate || undefined,
    address: fields.payload.pickup_address?.trim() || undefined,
    message: fields.message || undefined,
    email: fields.email || undefined,
    formName: fields.formName,
    sourcePath: fields.sourcePath || undefined,
    sourceUrl: fields.referer || undefined,
    sourceSystem: "katet.tech",
    fields: fields.payload,
  };
}

async function forwardLeadToCrm(fields: LeadFields) {
  if (!CRM_SITE_INGEST_URL) {
    return { ok: false, skipped: true, reason: "CRM_SITE_INGEST_URL is not set" };
  }

  if (!CRM_SITE_SECRET && !CRM_SITE_ALLOW_UNSIGNED) {
    return {
      ok: false,
      skipped: true,
      reason: "CRM_SITE_SECRET is not set (set CRM_SITE_ALLOW_UNSIGNED=true only for local/dev)",
    };
  }

  // Keep signature source equal to the actual transmitted JSON payload.
  const payload = toJsonValue(buildCrmPayload(fields));
  const eventBody = {
    channel: "site" as const,
    externalId: buildCrmExternalId(fields),
    payload,
  };

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (CRM_SITE_SECRET) {
    const timestamp = Date.now().toString();
    const signatureMessage = `${timestamp}.site.${stableSerialize(payload)}`;
    const signature = createHmac("sha256", CRM_SITE_SECRET).update(signatureMessage).digest("hex");
    headers["x-integration-timestamp"] = timestamp;
    headers["x-integration-signature"] = `sha256=${signature}`;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 10000);

  try {
    const response = await fetch(CRM_SITE_INGEST_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(eventBody),
      cache: "no-store",
      signal: abortController.signal,
    });

    const responseText = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        reason: `CRM ${response.status}: ${responseText.slice(0, 400)}`,
      };
    }

    return {
      ok: true,
      skipped: false,
      reason: null,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "Unknown CRM forwarding error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function storeLeadInDirectus(fields: LeadFields, payload: Record<string, unknown>): Promise<IngestResult> {
  const itemsUrl = directusItemsUrl();
  if (!itemsUrl) {
    return {
      ok: false,
      skipped: true,
      reason: "Directus URL is not configured (set DIRECTUS_INTERNAL_URL or NEXT_PUBLIC_DIRECTUS_URL)",
    };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (DIRECTUS_LEADS_TOKEN) {
    headers.authorization = `Bearer ${DIRECTUS_LEADS_TOKEN}`;
  }

  const body = toJsonValue({
    status: "new",
    source_path: fields.sourcePath,
    form_name: fields.formName || "Сайт",
    name: fields.name || null,
    phone: fields.phone,
    email: fields.email || null,
    message: fields.message || null,
    payload,
  });

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), directusWriteTimeoutMs());

  try {
    const response = await fetch(itemsUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: abortController.signal,
    });

    const responseText = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        reason: `Directus ${response.status}: ${responseText.slice(0, 400)}`,
      };
    }

    return {
      ok: true,
      skipped: false,
      reason: null,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "Unknown Directus write error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function storeLeadInDatabase(fields: LeadFields, payload: Record<string, unknown>): Promise<IngestResult> {
  try {
    await query(
      `
        INSERT INTO leads (source_path, form_name, name, phone, email, message, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        fields.sourcePath,
        fields.formName || "Сайт",
        fields.name || null,
        fields.phone,
        fields.email || null,
        fields.message || null,
        JSON.stringify(payload),
      ],
    );

    return {
      ok: true,
      skipped: false,
      reason: null,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "Unknown PostgreSQL write error",
    };
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const referer = request.headers.get("referer") || null;
  const lead = normalizeLeadFields(formData, referer);

  if (lead.phone) {
    const crmForwarding = await forwardLeadToCrm(lead);
    if (!crmForwarding.ok && !crmForwarding.skipped) {
      console.error("CRM lead forwarding failed", {
        formName: lead.formName,
        sourcePath: lead.sourcePath,
        reason: crmForwarding.reason,
      });
    }

    const basePayload: Record<string, unknown> = {
      ...lead.payload,
      crm_forwarded: crmForwarding.ok,
      crm_skipped: crmForwarding.skipped,
      crm_reason: crmForwarding.reason,
      crm_target: CRM_SITE_INGEST_URL || null,
    };

    const directusWrite = await storeLeadInDirectus(lead, {
      ...basePayload,
      lead_sink: "directus_api",
      directus_target: DIRECTUS_INTERNAL_URL || null,
      directus_collection: DIRECTUS_LEADS_COLLECTION,
    });

    if (!directusWrite.ok) {
      const dbFallbackWrite = await storeLeadInDatabase(lead, {
        ...basePayload,
        lead_sink: "postgres_fallback",
        directus_write_error: directusWrite.reason,
        directus_target: DIRECTUS_INTERNAL_URL || null,
        directus_collection: DIRECTUS_LEADS_COLLECTION,
      });

      if (!dbFallbackWrite.ok) {
        console.error("Lead persistence failed", {
          formName: lead.formName,
          sourcePath: lead.sourcePath,
          directusWriteError: directusWrite.reason,
          dbFallbackWriteError: dbFallbackWrite.reason,
        });
        throw new Error("Lead persistence failed");
      }

      console.warn("Lead stored via PostgreSQL fallback", {
        formName: lead.formName,
        sourcePath: lead.sourcePath,
        reason: directusWrite.reason,
      });
    }
  }

  redirect("/thankyou/");
}