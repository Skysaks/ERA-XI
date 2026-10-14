/**
 * Notifications — contextual only, never on first visit, never unrelated engagement spam.
 * Delivery needs a push backend (not part of this build), so `PUSH_AVAILABLE` stays false
 * and the UI shows the preferences as "not available yet" instead of asking for a
 * permission it could not honour.
 */
export type NotificationKind = "daily" | "challenge" | "duel" | "weekly";

export const PUSH_AVAILABLE = false;

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

/** Ask only from a user action tied to the kind ("Want tomorrow's Daily XI?"). */
export async function requestInContext(_kind: NotificationKind): Promise<"granted" | "denied" | "unavailable"> {
  if (!PUSH_AVAILABLE || !notificationsSupported()) return "unavailable";
  const res = await Notification.requestPermission();
  return res === "granted" ? "granted" : "denied";
}
