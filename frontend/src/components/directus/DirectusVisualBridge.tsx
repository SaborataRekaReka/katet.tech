"use client";

import { useEffect } from "react";
import { apply, remove } from "@directus/visual-editing";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_DIRECTUS_URL ?? "http://localhost:8055").replace(/\/$/, "");

let bridgeApplied = false;

function isLikelyVisualEditorSession() {
  if (typeof window === "undefined") return false;

  if (window.self !== window.top) return true;

  const params = new URLSearchParams(window.location.search);
  if (params.has("directus") || params.has("_directus") || params.has("visual-editor")) {
    return true;
  }

  return /\/directus\/admin/i.test(document.referrer || "");
}

export function DirectusVisualBridge() {
  useEffect(() => {
    if (bridgeApplied) return;
    if (!isLikelyVisualEditorSession()) return;

    let disposed = false;

    apply({
      directusUrl: DIRECTUS_URL,
      onSaved: () => {
        window.location.reload();
      },
    })
      .then(() => {
        if (!disposed) {
          bridgeApplied = true;
        }
      })
      .catch((error) => {
        console.error("[visual-editor] bridge initialization failed", error);
      });

    return () => {
      disposed = true;
      if (bridgeApplied) {
        remove();
        bridgeApplied = false;
      }
    };
  }, []);

  return null;
}
