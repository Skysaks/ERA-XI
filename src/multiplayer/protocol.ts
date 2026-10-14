import * as z from "zod/mini";
import type { Intent, RoomSnapshot } from "./types";

/**
 * Wire protocol. Everything crossing the network is validated on both ends:
 * the server never trusts a request body, the client never trusts a response body.
 */

const NICK_RE = /^[\p{L}\p{N} .'_-]{1,16}$/u;
export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const CODE_RE = /^[a-z2-9]{5}$/;

export function sanitizeNickname(raw: unknown): string {
  if (typeof raw !== "string") return "Player";
  const t = raw.replace(/\s+/g, " ").trim().slice(0, 16);
  return NICK_RE.test(t) ? t : "Player";
}

const Token = z.string().check(z.regex(TOKEN_RE));
const Nickname = z.string().check(z.maxLength(40));
const Formation = z.enum(["433", "4231", "442", "352", "343", "4312", "41212", "4321", "424", "4222", "3421", "532", "523"]);

export const IntentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("lock"), round: z.int().check(z.gte(0), z.lte(10)), optionIndex: z.int().check(z.gte(0), z.lte(4)) }),
  z.strictObject({ type: z.literal("heartbeat") }),
  z.strictObject({ type: z.literal("leave") }),
  z.strictObject({ type: z.literal("rematch") }),
  z.strictObject({ type: z.literal("rename"), nickname: Nickname }),
]);

export const CreateRoomRequestSchema = z.strictObject({
  rulesetId: z.enum(["liveduel", "party", "shared"]),
  formation: Formation,
  nickname: Nickname,
  token: Token,
});

export const JoinRequestSchema = z.strictObject({ nickname: Nickname, token: Token });

export const IntentRequestSchema = z.strictObject({ token: Token, intent: IntentSchema });

export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;
export type JoinRequest = z.infer<typeof JoinRequestSchema>;
export type IntentRequest = z.infer<typeof IntentRequestSchema>;

const SeatViewSchema = z.object({
  seatId: z.string().check(z.maxLength(40)),
  nickname: z.string().check(z.maxLength(16)),
  you: z.boolean(),
  connection: z.enum(["connected", "reconnecting", "disconnected"]),
  progress: z.int().check(z.gte(0), z.lte(11)),
  picks: z.array(z.nullable(z.int().check(z.gte(0), z.lte(4)))).check(z.maxLength(11)),
  completed: z.boolean(),
  score: z.nullable(z.int().check(z.gte(0), z.lte(114))),
  rematch: z.boolean(),
});

export const SnapshotSchema = z.object({
  code: z.string().check(z.regex(CODE_RE)),
  rulesetId: z.enum(["liveduel", "party", "shared"]),
  formation: Formation,
  engineVersion: z.string().check(z.regex(/^\d{1,4}$/)),
  seed: z.string().check(z.regex(/^[a-z0-9]{6,24}$/)),
  generation: z.int().check(z.gte(0)),
  version: z.int().check(z.gte(0)),
  phase: z.enum(["waiting", "drafting", "completed"]),
  round: z.int().check(z.gte(-1), z.lte(11)),
  revealedThrough: z.int().check(z.gte(0), z.lte(11)),
  maxPlayers: z.int().check(z.gte(1), z.lte(8)),
  hostSeat: z.string(),
  you: z.nullable(z.string()),
  seats: z.array(SeatViewSchema).check(z.maxLength(8)),
  serverTime: z.number(),
});

export function parseIntent(raw: unknown): Intent | null {
  const r = IntentSchema.safeParse(raw);
  return r.success ? (r.data as Intent) : null;
}

/** Client-side guard for anything a transport hands back. */
export function parseSnapshot(raw: unknown): RoomSnapshot | null {
  const r = SnapshotSchema.safeParse(raw);
  return r.success ? (r.data as RoomSnapshot) : null;
}
