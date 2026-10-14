/**
 * PWA install suggestion: never on first visit. Eligible after real engagement
 * (3 completed games), shown once per eligibility, never again after a dismissal.
 * iOS has no install prompt API: we show two lines of Safari instructions instead.
 */
export const INSTALL_AFTER_GAMES = 3;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function captureInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep the browser's own banner away: we choose the moment
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
}

export function onInstallAvailable(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export type InstallPlatform = "prompt" | "ios" | "installed" | "unsupported";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function installPlatform(): InstallPlatform {
  if (typeof window === "undefined") return "unsupported";
  if (isStandalone()) return "installed";
  if (deferred) return "prompt";
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  if (ios && safari) return "ios";
  return "unsupported";
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  return choice.outcome === "accepted";
}

export function shouldSuggestInstall(state: { dismissed: boolean; installed: boolean }, completedGames: number): boolean {
  return !state.dismissed && !state.installed && completedGames >= INSTALL_AFTER_GAMES && (installPlatform() === "prompt" || installPlatform() === "ios");
}
