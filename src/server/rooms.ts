import { RoomServer, type RoomErrorCode } from "@/multiplayer";

/**
 * Process-wide authoritative room host for the Next.js deployment.
 * Single-instance memory store (prototype). For multi-instance production, back
 * RoomServer with Redis / Durable Objects and move polling to WebSockets.
 */
const g = globalThis as unknown as { __eraxiRooms?: RoomServer };
export const roomServer: RoomServer = (g.__eraxiRooms ??= new RoomServer());

export const STATUS: Record<RoomErrorCode, number> = {
  malformed: 400,
  not_found: 404,
  room_full: 409,
  not_in_room: 403,
  not_started: 409,
  out_of_turn: 409,
  invalid_option: 422,
  finished: 409,
  rate_limited: 429,
  unavailable: 503,
  expired: 410,
  version_mismatch: 409,
};

/** Largest request body the room API accepts. Real requests are a few hundred bytes. */
export const MAX_BODY_BYTES = 4096;

const MAX_KEYS = 20_000;

/** Fixed-window counters, keyed by limiter key. Stale windows are pruned, never wholesale cleared. */
const hits = new Map<string, { n: number; t: number; w: number }>();

function prune(now: number) {
  for (const [k, h] of hits) if (now - h.t > h.w) hits.delete(k);
  // Still saturated (flood of distinct keys): drop the oldest half rather than resetting everyone.
  if (hits.size > MAX_KEYS) {
    let i = 0;
    const drop = hits.size / 2;
    for (const k of hits.keys()) {
      if (i++ >= drop) break;
      hits.delete(k);
    }
  }
}

/**
 * True when `key` has exceeded `limit` hits within `windowMs`. In-memory, per process:
 * enough to stop accidental hammering and casual abuse on a single instance.
 */
export function rateLimited(key: string, limit = 25, windowMs = 1000): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.t > windowMs) {
    if (hits.size >= MAX_KEYS) prune(now);
    hits.set(key, { n: 1, t: now, w: windowMs });
    return false;
  }
  h.n++;
  return h.n > limit;
}

/**
 * Best-effort client address for rate limiting. `x-real-ip` is set by the hosting proxy
 * (Vercel, nginx); otherwise the right-most `x-forwarded-for` hop is used, because entries
 * on the left can be supplied by the client itself.
 */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const fwd = request.headers.get("x-forwarded-for");
  const last = fwd?.split(",").pop()?.trim();
  return last ? last.slice(0, 64) : "local";
}

/** Shared per-address ceiling across every room endpoint (a party of 8 behind one NAT stays well below it). */
export function ipLimited(request: Request): boolean {
  return rateLimited(`ip:${clientIp(request)}`, 60);
}

export const RATE_LIMITED = () => Response.json({ error: { code: "rate_limited", message: "Slow down." } }, { status: 429, headers: { "retry-after": "1" } });

/**
 * Reads a JSON body with a hard size cap. Returns `undefined` for an oversized body
 * (caller answers 413) and `null` for a missing or unparsable one.
 */
export async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return undefined;
  let text: string;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (new TextEncoder().encode(text).length > maxBytes) return undefined;
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export const TOO_LARGE = () => Response.json({ error: { code: "malformed", message: "Request too large." } }, { status: 413 });
