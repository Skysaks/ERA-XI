import { roomServer, rateLimited, clientIp, ipLimited, readJson, RATE_LIMITED, TOO_LARGE, STATUS } from "@/server/rooms";

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const ip = clientIp(request);
  // Burst guard plus a per-minute ceiling, so one address cannot fill the room table.
  if (ipLimited(request) || rateLimited(`create:${ip}`, 5) || rateLimited(`create-min:${ip}`, 30, 60_000)) return RATE_LIMITED();
  const body = await readJson(request);
  if (body === undefined) return TOO_LARGE();
  const r = roomServer.create(body);
  return r.ok ? Response.json({ snapshot: r.value }, { headers: noStore }) : Response.json({ error: r.error }, { status: STATUS[r.error.code], headers: noStore });
}
