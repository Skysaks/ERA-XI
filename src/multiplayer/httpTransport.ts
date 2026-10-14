import type { CreateRoomRequest, JoinRequest } from "./protocol";
import { parseSnapshot } from "./protocol";
import { fail, ok, type Intent, type Result, type RoomSnapshot } from "./types";
import type { RoomListener, RoomTransport, TransportStatus } from "./transport";

/**
 * HTTP transport against the authoritative server (Next.js route handlers in this repo).
 * Polling keeps it deployable anywhere; a WebSocket transport can replace it behind the
 * same interface. Every response is schema-validated before use.
 */
export class HttpTransport implements RoomTransport {
  readonly kind = "http" as const;

  constructor(private base = "/api/rooms", private pollMs = 600) {}

  private async call(url: string, init?: RequestInit, token?: string): Promise<Result<RoomSnapshot>> {
    let res: Response;
    try {
      // The seat token travels in a header on polls (never in the URL: logs, referrers).
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["x-seat-token"] = token;
      res = await fetch(url, { ...init, headers, cache: "no-store" });
    } catch {
      return fail("unavailable", "Network unavailable.");
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return fail("malformed", "Unreadable server response.");
    }
    if (!res.ok) {
      const e = (body as { error?: { code?: string; message?: string } })?.error;
      return fail((e?.code as never) ?? "unavailable", e?.message ?? `Server error ${res.status}`);
    }
    const snap = parseSnapshot((body as { snapshot?: unknown }).snapshot);
    return snap ? ok(snap) : fail("malformed", "Unexpected server response.");
  }

  create(req: CreateRoomRequest) {
    return this.call(this.base, { method: "POST", body: JSON.stringify(req) });
  }

  join(code: string, req: JoinRequest) {
    return this.call(`${this.base}/${code}`, { method: "POST", body: JSON.stringify({ action: "join", ...req }) });
  }

  send(code: string, token: string, intent: Intent) {
    return this.call(`${this.base}/${code}`, { method: "POST", body: JSON.stringify({ action: "intent", token, intent }) });
  }

  watch(code: string, token: string, listener: RoomListener): () => void {
    let alive = true;
    let failures = 0;
    let status: TransportStatus = "online";
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    const setStatus = (s: TransportStatus) => {
      if (s !== status) {
        status = s;
        listener.onStatus?.(s);
      }
    };
    const tick = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      if (timer) clearTimeout(timer);
      const r = await this.call(`${this.base}/${code}`, undefined, token);
      inFlight = false;
      if (!alive) return;
      if (r.ok) {
        failures = 0;
        setStatus("online");
        listener.onSnapshot(r.value);
      } else if (r.error.code === "unavailable") {
        failures++;
        setStatus(failures > 8 ? "offline" : "reconnecting");
      } else {
        listener.onError?.(r.error);
        // A room that no longer exists will not come back: stop polling it.
        if (r.error.code === "expired" || r.error.code === "not_found") {
          alive = false;
          detach();
          return;
        }
      }
      listener.onAttempt?.(failures);
      // Back off gently while the network is down; never give up on a live duel.
      const wait = failures === 0 ? this.pollMs : Math.min(3000, this.pollMs * (1 + failures));
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      timer = setTimeout(tick, hidden ? Math.max(wait, 2000) : wait);
    };
    // Back from the background, a locked phone or a dead network: refresh at once instead of
    // waiting out a stretched poll interval.
    const wake = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") void tick();
    };
    const detach = () => {
      if (typeof window === "undefined") return;
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
    };
    if (typeof window !== "undefined") {
      document.addEventListener("visibilitychange", wake);
      window.addEventListener("online", wake);
      window.addEventListener("focus", wake);
    }
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      detach();
    };
  }
}
