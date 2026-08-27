"use client";

import { useEffect, useRef } from "react";

type StoredAttribution = {
  firstLandingPage: string;
  referrer: string;
  yclid: string;
  utm: Record<string, string>;
  capturedAt: string;
};

const STORAGE_KEY = "katet_lead_attribution_v1";
const STORAGE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const YANDEX_COUNTER_IDS = (process.env.NEXT_PUBLIC_YANDEX_COUNTER_IDS || "89111072")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function readCookie(name: string) {
  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}

function currentAttribution(): StoredAttribution {
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};

  for (const [key, value] of params.entries()) {
    const normalizedKey = key.trim().toLowerCase();
    const normalizedValue = value.trim();
    if (normalizedKey.startsWith("utm_") && normalizedValue) {
      utm[normalizedKey] = normalizedValue;
    }
  }

  return {
    firstLandingPage: window.location.href,
    referrer: document.referrer,
    yclid: params.get("yclid")?.trim() || "",
    utm,
    capturedAt: new Date().toISOString(),
  };
}

function loadFirstTouch(): StoredAttribution {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<StoredAttribution>;
      const capturedAtMs = Date.parse(stored.capturedAt || "");
      if (
        Number.isFinite(capturedAtMs) &&
        Date.now() - capturedAtMs < STORAGE_TTL_MS &&
        typeof stored.firstLandingPage === "string"
      ) {
        return {
          firstLandingPage: stored.firstLandingPage,
          referrer: typeof stored.referrer === "string" ? stored.referrer : "",
          yclid: typeof stored.yclid === "string" ? stored.yclid : "",
          utm: stored.utm && typeof stored.utm === "object" ? stored.utm : {},
          capturedAt: stored.capturedAt || new Date().toISOString(),
        };
      }
    }
  } catch {
    // Attribution still works for this submission when storage is unavailable.
  }

  const attribution = currentAttribution();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Storage can be disabled by the browser; hidden fields remain available.
  }
  return attribution;
}

function createSubmissionId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function LeadAttributionFields() {
  const rootRef = useRef<HTMLSpanElement>(null);
  const submissionIdRef = useRef<HTMLInputElement>(null);
  const metrikaClientIdRef = useRef<HTMLInputElement>(null);
  const yclidRef = useRef<HTMLInputElement>(null);
  const utmRef = useRef<HTMLInputElement>(null);
  const firstLandingPageRef = useRef<HTMLInputElement>(null);
  const referrerRef = useRef<HTMLInputElement>(null);
  const capturedAtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const firstTouch = loadFirstTouch();
    const fallbackClientId = readCookie("_ym_uid");

    if (metrikaClientIdRef.current) metrikaClientIdRef.current.value = fallbackClientId;
    if (yclidRef.current) yclidRef.current.value = firstTouch.yclid;
    if (utmRef.current) utmRef.current.value = JSON.stringify(firstTouch.utm);
    if (firstLandingPageRef.current) firstLandingPageRef.current.value = firstTouch.firstLandingPage;
    if (referrerRef.current) referrerRef.current.value = firstTouch.referrer;
    if (capturedAtRef.current) capturedAtRef.current.value = firstTouch.capturedAt;

    let attempts = 0;
    const requestMetrikaClientId = () => {
      attempts += 1;
      if (typeof window.ym !== "function") return attempts >= 20;

      for (const counterId of YANDEX_COUNTER_IDS) {
        window.ym(String(counterId), "getClientID", (clientId: unknown) => {
          if (metrikaClientIdRef.current && typeof clientId === "string" && clientId.trim()) {
            metrikaClientIdRef.current.value = clientId.trim();
          }
        });
      }
      return true;
    };

    let timer: ReturnType<typeof setInterval> | undefined;
    if (!requestMetrikaClientId()) {
      timer = setInterval(() => {
        if (requestMetrikaClientId() && timer) clearInterval(timer);
      }, 500);
    }

    const form = rootRef.current?.closest("form");
    const handleSubmit = () => {
      if (submissionIdRef.current && !submissionIdRef.current.value) {
        submissionIdRef.current.value = createSubmissionId();
      }
    };
    form?.addEventListener("submit", handleSubmit);

    return () => {
      if (timer) clearInterval(timer);
      form?.removeEventListener("submit", handleSubmit);
    };
  }, []);

  return (
    <span ref={rootRef} hidden>
      <input ref={submissionIdRef} name="attribution_submission_id" type="hidden" />
      <input ref={metrikaClientIdRef} name="attribution_metrika_client_id" type="hidden" />
      <input ref={yclidRef} name="attribution_yclid" type="hidden" />
      <input ref={utmRef} name="attribution_utm_json" type="hidden" />
      <input ref={firstLandingPageRef} name="attribution_first_landing_page" type="hidden" />
      <input ref={referrerRef} name="attribution_referrer" type="hidden" />
      <input ref={capturedAtRef} name="attribution_captured_at" type="hidden" />
    </span>
  );
}
