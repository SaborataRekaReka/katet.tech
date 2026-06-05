"use client";

import { useEffect } from "react";

type YmFn = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
type MgoFn = ((...args: unknown[]) => void) & { q?: unknown[][]; u?: string; t?: number };

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    ym?: YmFn;
    MangoObject?: string;
    mgo?: MgoFn;
  }
}

const GA_ID = (process.env.NEXT_PUBLIC_GA4_ID || "G-WZP3YB8467").trim();
const BOTFAQTOR_ID = (process.env.NEXT_PUBLIC_BOTFAQTOR_ID || "133613").trim();
const MANGO_DOMAIN = (process.env.NEXT_PUBLIC_MANGO_DOMAIN || "katet.tech").trim();
const MANGO_PHONE = (process.env.NEXT_PUBLIC_MANGO_PHONE || "74994606567").trim();
const MANGO_CALLTRACKING_ID = Number(process.env.NEXT_PUBLIC_MANGO_CALLTRACKING_ID || "27903");
const YANDEX_WEBVISOR = (process.env.NEXT_PUBLIC_YANDEX_WEBVISOR || "true").trim().toLowerCase() !== "false";
const YANDEX_COUNTER_IDS = (process.env.NEXT_PUBLIC_YANDEX_COUNTER_IDS || "89111072")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const TRIGGER_EVENTS = ["click", "scroll", "keydown", "touchstart"] as const;

function loadScript(src: string, id: string) {
  if (!src || document.getElementById(id)) return;

  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;

  const firstScript = document.getElementsByTagName("script")[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
    return;
  }

  document.head.appendChild(script);
}

function ensureYmStub() {
  if (typeof window.ym === "function") return;

  const stub = ((...args: unknown[]) => {
    (stub.a ||= []).push(args);
  }) as YmFn;
  stub.l = Date.now();
  window.ym = stub;
}

function ensureGaStub() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || ((...args: unknown[]) => {
    window.dataLayer?.push(args);
  });
}

function ensureMangoStub() {
  if (typeof window.mgo === "function") return window.mgo;

  const stub = ((...args: unknown[]) => {
    (stub.q ||= []).push(args);
  }) as MgoFn;

  window.mgo = stub;
  return stub;
}

export function LegacyExternalScripts() {
  useEffect(() => {
    let analyticsLoaded = false;
    let botfaqtorLoaded = false;
    let mangoLoaded = false;

    const initYandex = () => {
      if (typeof window.ym !== "function" || !YANDEX_COUNTER_IDS.length) return;

      for (const counterId of YANDEX_COUNTER_IDS) {
        window.ym(String(counterId), "init", {
          clickmap: true,
          trackLinks: true,
          referrer: document.referrer,
          url: location.href,
          accurateTrackBounce: true,
          webvisor: YANDEX_WEBVISOR,
          ecommerce: "dataLayer",
        });
      }
    };

    const initGa = () => {
      if (!GA_ID || typeof window.gtag !== "function") return;
      window.gtag("js", new Date());
      window.gtag("config", GA_ID);
    };

    const loadAnalytics = () => {
      if (analyticsLoaded) return;
      analyticsLoaded = true;

      ensureGaStub();
      ensureYmStub();

      if (GA_ID) {
        loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`, "katet-ga4-js");
        initGa();
      }

      if (YANDEX_COUNTER_IDS.length) {
        loadScript("https://mc.yandex.ru/metrika/tag.js", "katet-yandex-metrika-js");
        initYandex();
      }
    };

    const loadBotfaqtor = () => {
      if (botfaqtorLoaded || !BOTFAQTOR_ID) return;
      botfaqtorLoaded = true;
      loadScript(`https://scripts.botfaqtor.ru/one/${encodeURIComponent(BOTFAQTOR_ID)}`, "katet-botfaqtor-js");
    };

    const loadMango = () => {
      if (mangoLoaded) return;
      mangoLoaded = true;

      window.MangoObject = "mgo";
      const mgo = ensureMangoStub();
      mgo.u = "https://widgets.mango-office.ru/widgets/mango.js";
      mgo.t = Date.now();

      loadScript("https://widgets.mango-office.ru/widgets/mango.js", "mango-js");

      if (Number.isFinite(MANGO_CALLTRACKING_ID) && MANGO_CALLTRACKING_ID > 0) {
        mgo({
          calltracking: {
            id: MANGO_CALLTRACKING_ID,
            elements: [{ numberText: MANGO_PHONE }],
            domain: MANGO_DOMAIN,
          },
        });
      }
    };

    const handleSubmitClick = (event: Event) => {
      if (typeof window.ym !== "function" || !YANDEX_COUNTER_IDS.length) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      const submitControl = target.closest("button[type='submit'], input[type='submit']");
      if (!submitControl) return;

      for (const counterId of YANDEX_COUNTER_IDS) {
        window.ym(String(counterId), "reachGoal", "formSend");
      }
    };

    const botfaqtorTrigger = () => {
      loadBotfaqtor();
      TRIGGER_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, botfaqtorTrigger, true);
      });
    };

    // Load analytics on initial render so the counter is available without extra user actions.
    loadAnalytics();

    TRIGGER_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, loadAnalytics, { once: true });
      window.addEventListener(eventName, loadMango, { once: true });
      window.addEventListener(eventName, botfaqtorTrigger, { passive: true, capture: true });
    });

    document.addEventListener("click", handleSubmitClick);

    return () => {
      TRIGGER_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, loadAnalytics);
        window.removeEventListener(eventName, loadMango);
        window.removeEventListener(eventName, botfaqtorTrigger, true);
      });
      document.removeEventListener("click", handleSubmitClick);
    };
  }, []);

  return null;
}
