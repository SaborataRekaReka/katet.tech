import { createHmac } from "node:crypto";

const ingestUrl = process.env.CRM_SITE_INGEST_URL?.trim() || "";
const siteSecret = process.env.CRM_SITE_SECRET?.trim() || "";

if (!ingestUrl) {
  console.error("CRM integration check failed: CRM_SITE_INGEST_URL is not configured.");
  process.exit(1);
}

if (!siteSecret) {
  console.error("CRM integration check failed: CRM_SITE_SECRET is not configured.");
  process.exit(1);
}

const timestamp = Date.now().toString();
const payload = {};
const signatureMessage = `${timestamp}.site.{}`;
const signature = createHmac("sha256", siteSecret).update(signatureMessage).digest("hex");

const response = await fetch(ingestUrl, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-integration-timestamp": timestamp,
    "x-integration-signature": `sha256=${signature}`,
  },
  body: JSON.stringify({
    channel: "site",
    externalId: `safe-secret-probe:${timestamp}`,
    payload,
  }),
  signal: AbortSignal.timeout(10_000),
});

// Authentication runs before payload validation in CRM. HTTP 400 therefore
// proves the signature was accepted while ensuring that no lead was created.
if (response.status !== 400) {
  console.error(`CRM integration check failed: unexpected HTTP ${response.status}.`);
  process.exit(1);
}

console.log("CRM integration signature check passed; no lead was created.");
