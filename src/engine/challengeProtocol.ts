import * as z from "zod/mini";
import type { DraftChoice, DraftState, EraBucket, RulesetId, SeasonResult } from "@/types";
import { RULESETS, drawRulesOf } from "./rulesets";
import { isDraftComplete, layoutOf, replayDraft } from "./draft";
import { runSeason } from "./season";
import { MAX_POINTS, PROTOCOL_VERSION, ROUNDS } from "./version";
import { SUPPORTED_ENGINE_VERSIONS } from "./simulation";

/**
 * Challenge links are self-contained (no server): the payload carries the seed and
 * the creator's decisions. The receiver replays them to rebuild the creator's XI and
 * verifies the claimed score — a hand-edited score is rejected.
 *
 * Picks are in the payload but never shown before the challenger finishes.
 */
const NAME_RE = /^[\p{L}\p{N} .'_-]{1,16}$/u;
const MAX_TOKEN_LENGTH = 600;
const BASE11 = "0123456789a";

export const ChallengePayloadSchema = z.strictObject({
  v: z.literal(PROTOCOL_VERSION),
  e: z.string().check(z.regex(/^\d{1,4}$/)),
  s: z.string().check(z.regex(/^[a-z0-9]{6,24}$/)),
  m: z.enum(["classic", "iq", "daily", "eralock", "noreroll", "nations", "oneclub", "blitz", "cult", "gauntlet", "mystery", "champions", "position", "oneleague", "weekly", "worldxi"]),
  f: z.enum(["433", "4231", "442", "352", "343", "4312", "41212", "4321", "424", "4222", "3421", "532", "523"]),
  sc: z.int().check(z.gte(0), z.lte(MAX_POINTS)),
  p: z.string().check(z.regex(new RegExp(`^[0-4]{${ROUNDS}}$`))),
  r: z.int().check(z.gte(-1), z.lte(ROUNDS - 1)),
  l: z.string().check(z.regex(new RegExp(`^[0-9a]{${ROUNDS}}$`))),
  n: z.optional(z.string().check(z.regex(NAME_RE))),
  d: z.optional(z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/))),
  /** Pre-draft choice: "b:<bucket>" (Era Lock period) or "k:<club id>" (One Club). */
  c: z.optional(z.string().check(z.regex(/^(b:(pre1980|1980s|1990s|2000s|2010s|2020s)|k:[a-z0-9-]{2,24}|l:[A-Z]{3})$/))),
  /** Weekly event id. */
  w: z.optional(z.string().check(z.regex(/^[a-z0-9]{2,24}$/))),
  /** Engine v4: formation chosen after the draft (f stays the draft formation, which the offers depend on). */
  g: z.optional(z.enum(["433", "4231", "442", "352", "343", "4312", "41212", "4321", "424", "4222", "3421", "532", "523"])),
  /** Premium (ERA+) custom rules were used. The receiver still plays for free (viral rule). */
  x: z.optional(z.literal(1)),
});

export type ChallengePayload = z.infer<typeof ChallengePayloadSchema>;

export interface VerifiedChallenge {
  token: string;
  payload: ChallengePayload;
  creatorName: string | null;
  creatorState: DraftState;
  creatorResult: SeasonResult;
}

export type ChallengeDecodeResult =
  | { ok: true; challenge: VerifiedChallenge }
  | { ok: false; reason: "malformed" | "outdated" | "invalid" | "score_mismatch" };

export function sanitizeName(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.replace(/\s+/g, " ").trim().slice(0, 16);
  return NAME_RE.test(trimmed) ? trimmed : undefined;
}

// ── base64url over UTF-8, no Node Buffer dependency (works in RN/Expo too) ──
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

type ChallengeMode = ChallengePayload["m"];
const CHALLENGE_MODES: readonly string[] = ChallengePayloadSchema.shape.m.options;

export function encodeChoice(c: DraftChoice | undefined): string | undefined {
  if (!c) return undefined;
  return "bucket" in c ? `b:${c.bucket}` : "league" in c ? `l:${c.league}` : `k:${c.clubId}`;
}

export function decodeChoice(s: string | undefined): DraftChoice | undefined {
  if (!s) return undefined;
  return s.startsWith("b:") ? { bucket: s.slice(2) as EraBucket } : s.startsWith("l:") ? { league: s.slice(2) } : { clubId: s.slice(2) };
}

/**
 * Multiplayer drafts can be re-shared as solo challenges: a duel/party draw uses the same
 * draw rules as No Reroll, so the link replays the identical offers.
 */
export function challengeModeOf(mode: RulesetId): ChallengeMode {
  if (CHALLENGE_MODES.includes(mode)) return mode as ChallengeMode;
  const a = JSON.stringify(drawRulesOf(RULESETS[mode]));
  const b = JSON.stringify(drawRulesOf(RULESETS.noreroll));
  if (a !== b || RULESETS[mode].rerolls !== 0) throw new Error(`Ruleset ${mode} cannot be shared as a challenge`);
  return "noreroll";
}

export function buildChallengePayload(state: DraftState, result: SeasonResult, name?: string): ChallengePayload {
  if (!isDraftComplete(state)) throw new Error("Draft not complete");
  const payload: ChallengePayload = {
    v: PROTOCOL_VERSION,
    e: state.config.engineVersion,
    s: state.config.seed,
    m: challengeModeOf(state.config.mode),
    f: state.config.formation,
    sc: result.points,
    p: state.picks.map((p) => String(p.optionIndex)).join(""),
    r: state.rerollRound ?? -1,
    l: layoutOf(state).map((r) => BASE11[r] ?? "0").join(""),
  };
  const n = sanitizeName(name);
  if (n) payload.n = n;
  if (state.config.daily) payload.d = state.config.daily;
  const c = encodeChoice(state.config.choice);
  if (c) payload.c = c;
  if (state.config.event) payload.w = state.config.event;
  if (state.formation && state.formation !== state.config.formation) payload.g = state.formation;
  return ChallengePayloadSchema.parse(payload);
}

export function encodeChallenge(payload: ChallengePayload): string {
  return toBase64Url(JSON.stringify(ChallengePayloadSchema.parse(payload)));
}

export function parseChallengeToken(token: string): ChallengePayload | null {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const json: unknown = JSON.parse(fromBase64Url(token));
    const parsed = ChallengePayloadSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Full validation: schema → engine version → replay → score verification. */
export function decodeChallenge(token: string): ChallengeDecodeResult {
  const payload = parseChallengeToken(token);
  if (!payload) return { ok: false, reason: "malformed" };
  // Older engine versions keep replaying on their own dataset and model (links never rot while supported).
  if (!SUPPORTED_ENGINE_VERSIONS.includes(payload.e)) return { ok: false, reason: "outdated" };
  let creatorState: DraftState;
  let creatorResult: SeasonResult;
  try {
    creatorState = replayDraft(
      { seed: payload.s, formation: payload.f, mode: payload.m, engineVersion: payload.e, daily: payload.d, choice: decodeChoice(payload.c), event: payload.w },
      payload.p.split("").map(Number),
      payload.r === -1 ? null : payload.r,
      payload.l.split("").map((c) => BASE11.indexOf(c)),
      payload.g,
    );
    creatorResult = runSeason(creatorState);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (creatorResult.points !== payload.sc) return { ok: false, reason: "score_mismatch" };
  return { ok: true, challenge: { token, payload, creatorName: payload.n ?? null, creatorState, creatorResult } };
}
