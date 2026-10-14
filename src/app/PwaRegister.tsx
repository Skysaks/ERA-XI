"use client";

import { useEffect } from "react";
import { captureInstallPrompt } from "@/platform/install";

/** Registers the service worker in production and hands it the assets already loaded. */
export function PwaRegister() {
  useEffect(() => {
    captureInstallPrompt();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const worker = reg.active ?? reg.waiting ?? reg.installing;
        const send = () => {
          const urls = performance.getEntriesByType("resource").map((e) => e.name);
          (navigator.serviceWorker.controller ?? reg.active)?.postMessage({ type: "cache-urls", urls: [...urls, location.origin + "/"] });
        };
        if (worker?.state === "activated") send();
        else worker?.addEventListener("statechange", () => worker.state === "activated" && send());
        // Secondary chunks are prefetched when the page is idle: hand those over too.
        setTimeout(() => worker?.state === "activated" && send(), 6000);
      } catch {
        /* offline support is a bonus, never a blocker */
      }
    };
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });
  }, []);
  return null;
}
