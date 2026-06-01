import { createHash, createHmac } from "node:crypto";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";

const CRM_SITE_INGEST_URL = process.env.CRM_SITE_INGEST_URL?.trim() || "";
const CRM_SITE_SECRET = process.env.CRM_SITE_SECRET?.trim() || "";
const CRM_SITE_EXTERNAL_ID_PREFIX = process.env.CRM_SITE_EXTERNAL_ID_PREFIX?.trim() || "katet.tech";
const CRM_SITE_ALLOW_UNSIGNED = (process.env.CRM_SITE_ALLOW_UNSIGNED || "").toLowerCase() === "true";

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

    await query(
      `
        INSERT INTO leads (source_path, form_name, name, phone, email, message, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        lead.sourcePath,
        lead.formName || "Сайт",
        lead.name || null,
        lead.phone,
        lead.email || null,
        lead.message || null,
        JSON.stringify({
          ...lead.payload,
          crm_forwarded: crmForwarding.ok,
          crm_skipped: crmForwarding.skipped,
          crm_reason: crmForwarding.reason,
          crm_target: CRM_SITE_INGEST_URL || null,
        }),
      ],
    );
  }

  redirect("/thankyou/");
}