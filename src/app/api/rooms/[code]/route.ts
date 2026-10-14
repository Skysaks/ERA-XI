import { roomServer, rateLimited, clientIp, ipLimited, readJson, RATE_LIMITED, TOO_LARGE, STATUS } from "@/server/rooms";

type Ctx = { params: Promise<{ code: string }> };

const noStore = { "cache-control": "no-store" };

export async function GET(request: Request, { params }: Ctx) {
  const { code } = await params;
  // Header first (current clients); the query parameter is still accepted from cached older apps.
  const token = request.headers.get("x-seat-token") ?? new URL(request.url).searchParams.get("token") ?? "";
  if (ipLimited(request) || rateLimited(`poll:${clientIp(request)}:${token.slice(0, 64)}`, 10)) return RATE_LIMITED();
  const r = roomServer.poll(code, token);
  return r.ok ? Response.json({ snapshot: r.value }, { headers: noStore }) : Response.json({ error: r.error }, { status: STATUS[r.error.code], headers: noStore });
}

export async function POST(request: Request, { params }: Ctx) {
  const { code } = await params;
  if (ipLimited(request)) return RATE_LIMITED();
  const raw = await readJson(request);
  if (raw === undefined) return TOO_LARGE();
  const body: Record<string, unknown> = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const { action, ...rest } = body;
  const token = typeof rest.token === "string" ? rest.token.slice(0, 64) : "";
  if (rateLimited(`post:${clientIp(request)}:${token}`, 10)) return RATE_LIMITED();
  const r = action === "join" ? roomServer.join(code, rest) : action === "intent" ? roomServer.intent(code, rest) : null;
  if (!r) return Response.json({ error: { code: "malformed", message: "Unknown action." } }, { status: 400, headers: noStore });
  return r.ok ? Response.json({ snapshot: r.value }, { headers: noStore }) : Response.json({ error: r.error }, { status: STATUS[r.error.code], headers: noStore });
}
