import type { ClubEra, DraftChoice, DraftDraw, DraftOffer, EraBucket, FormationId, Line, PlayerEra, Position } from "@/types";
import { erasForEngine, getClub, getClubEra, getPlayerEra } from "@/data";
import { OUT_OF_POSITION_THRESHOLD, POSITION_LINE, positionFamiliarity } from "./positions";
import { getFormation } from "./formation";
import { RULESETS, drawRulesOf, type DrawRules } from "./rulesets";
import { rngFor, type Rng } from "./rng";
import { ENGINE_VERSION, ROUNDS } from "./version";
import { buildDirectedOffer } from "./director";

const MAX_SAME_CLUB = 2;

function primaryLine(p: PlayerEra): Line {
  return POSITION_LINE[p.positions[0] ?? "CM"];
}

/** Stars are likelier, but solid players still show up and create real dilemmas. */
function starWeight(p: PlayerEra): number {
  return Math.pow(Math.max(1, p.overall - 74), 1.6);
}

function pickWeighted(rng: Rng, pool: PlayerEra[], weight: (p: PlayerEra) => number): PlayerEra | null {
  if (!pool.length) return null;
  return pool[rng.weightedIndex(pool.map(weight))] ?? null;
}

/**
 * Four players with different jobs: attacker, midfielder, defender and a flexible
 * fourth (a keeper on GK rounds, otherwise favouring versatile players).
 */
function buildOffer(
  rng: Rng,
  era: ClubEra,
  wantGk: boolean,
  usedPlayers: ReadonlySet<string>,
  choiceCount: number,
  maxOverall: number | null = null,
  exclude: ReadonlySet<string> | null = null,
): { offer: DraftOffer; gotGk: boolean } | null {
  const pool = era.playerEraIds
    .map(getPlayerEra)
    .filter((p) => !usedPlayers.has(p.playerId) && (maxOverall === null || p.overall <= maxOverall) && (!exclude || !exclude.has(p.playerId)));
  if (pool.length < choiceCount) return null;

  const chosen: PlayerEra[] = [];
  const available = () => pool.filter((p) => !chosen.includes(p));
  const take = (line: Line | "FLEX") => {
    const avail = available();
    let candidates =
      line === "FLEX" ? avail.filter((p) => primaryLine(p) !== "GK") : avail.filter((p) => primaryLine(p) === line);
    if (!candidates.length) candidates = avail.filter((p) => primaryLine(p) !== "GK");
    if (!candidates.length) candidates = avail;
    const weight =
      line === "FLEX"
        ? (p: PlayerEra) => starWeight(p) * (p.positions.length >= 2 ? 1.5 : 1) * (chosen.some((c) => primaryLine(c) === primaryLine(p)) ? 0.8 : 1)
        : starWeight;
    const p = pickWeighted(rng, candidates, weight);
    if (p) chosen.push(p);
  };

  let gotGk = false;
  if (wantGk && pool.some((p) => primaryLine(p) === "GK")) {
    take("GK");
    gotGk = true;
  }
  // Different jobs first (attacker, midfielder, defender), then flexible picks.
  const template: (Line | "FLEX")[] = ["ATT", "MID", "DEF", "FLEX", "FLEX"];
  for (const line of template) {
    if (chosen.length >= choiceCount) break;
    take(line);
  }

  if (chosen.length !== choiceCount) return null;
  // Stable storage order: strongest first. Challenge picks index into this order.
  chosen.sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  return { offer: { clubEraId: era.id, options: chosen.map((p) => p.id) }, gotGk };
}

export const ERA_BUCKETS: EraBucket[] = ["pre1980", "1980s", "1990s", "2000s", "2010s", "2020s"];

/** Era Lock: the period is part of the seed, so a challenge replays the same period. */
export function lockedBucket(seed: string, engineVersion: string): EraBucket {
  return rngFor(seed, "era-lock", engineVersion).pick(ERA_BUCKETS);
}

/** Clubs with enough history for a whole One Club draft (checked by tests over many seeds). */
export const ONE_CLUB_MIN_ERAS = 5;
export const ONE_CLUB_MIN_PLAYERS = 54;
const oneClubCache = new Map<string, string[]>();
export function oneClubIds(engineVersion: string = ENGINE_VERSION): string[] {
  const hit = oneClubCache.get(engineVersion);
  if (hit) return hit;
  const eras = new Map<string, number>();
  const players = new Map<string, Set<string>>();
  for (const e of erasForEngine(engineVersion)) {
    if (e.kind !== "club") continue;
    eras.set(e.clubId, (eras.get(e.clubId) ?? 0) + 1);
    const set = players.get(e.clubId) ?? new Set<string>();
    for (const id of e.playerEraIds) set.add(id.slice(id.indexOf(":") + 1));
    players.set(e.clubId, set);
  }
  const ids = [...eras]
    .filter(([id, n]) => n >= ONE_CLUB_MIN_ERAS && (players.get(id)?.size ?? 0) >= ONE_CLUB_MIN_PLAYERS)
    .map(([id]) => id)
    .sort();
  oneClubCache.set(engineVersion, ids);
  return ids;
}

export function seededClub(seed: string, engineVersion: string): string {
  const ids = oneClubIds(engineVersion);
  if (!ids.length) throw new Error("No club has enough eras for One Club");
  return rngFor(seed, "one-club", engineVersion).pick(ids);
}

/** One League: countries with enough club history for a full draft (≥12 eras across ≥6 clubs). */
const leagueCache = new Map<string, string[]>();
export function oneLeagueIds(engineVersion: string = ENGINE_VERSION): string[] {
  const hit = leagueCache.get(engineVersion);
  if (hit) return hit;
  const eras = new Map<string, number>();
  const clubs = new Map<string, Set<string>>();
  for (const e of erasForEngine(engineVersion)) {
    if (e.kind !== "club") continue;
    const c = getClub(e.clubId).country;
    eras.set(c, (eras.get(c) ?? 0) + 1);
    const s = clubs.get(c) ?? new Set<string>();
    s.add(e.clubId);
    clubs.set(c, s);
  }
  const ids = [...eras].filter(([c, n]) => n >= 12 && (clubs.get(c)?.size ?? 0) >= 6).map(([c]) => c).sort();
  leagueCache.set(engineVersion, ids);
  return ids;
}

export function seededLeague(seed: string, engineVersion: string): string {
  return rngFor(seed, "one-league", engineVersion).pick(oneLeagueIds(engineVersion));
}

/** Pre-draft context that is part of the draw: formation (Position Draft) and the player's choice. */
export interface DrawContext {
  formation?: FormationId;
  choice?: DraftChoice;
}

/**
 * The whole draft is fixed by the seed (and the mode's draw rules): 11 rounds plus one
 * reserve offer for the single reroll. Independent of player choices, so a challenger
 * gets the exact same opportunities. Players never repeat across offers (no duplicate
 * picks), even when the same player exists in several eras.
 */
export function generateDraw(
  seed: string,
  engineVersion: string = ENGINE_VERSION,
  rules: DrawRules = drawRulesOf(RULESETS.classic),
  ctx: DrawContext = {},
): DraftDraw {
  if (rules.positionTargets) return generatePositionDraw(seed, engineVersion, rules, ctx);
  const rng = rngFor(seed, "draw", engineVersion);
  const total = ROUNDS + 1;

  // Keepers spread across the draft so there's always a late chance to fill the goal.
  const gkRounds = new Set<number>([rng.int(4), 4 + rng.int(4), 8 + rng.int(3)]);
  if (rng.next() < 0.5) gkRounds.add(rng.int(ROUNDS));
  const reserveWantsGk = rng.next() < 0.5;

  const chosenBucket = ctx.choice && "bucket" in ctx.choice ? ctx.choice.bucket : null;
  const bucket = rules.eraFilter.kind === "seededBucket" ? chosenBucket ?? lockedBucket(seed, engineVersion) : null;
  const chosenClub = ctx.choice && "clubId" in ctx.choice ? ctx.choice.clubId : null;
  const club = rules.clubFilter.kind === "seededClub" ? chosenClub ?? seededClub(seed, engineVersion) : null;
  const chosenLeague = ctx.choice && "league" in ctx.choice ? ctx.choice.league : null;
  const league = rules.clubFilter.kind === "seededLeague" ? chosenLeague ?? seededLeague(seed, engineVersion) : null;
  const countries = league ? new Set([league]) : rules.countries ? new Set(rules.countries) : null;
  const exclude = rules.excludePlayers ? new Set(rules.excludePlayers) : null;
  const allowedBuckets = rules.eraFilter.kind === "buckets" ? new Set<EraBucket>(rules.eraFilter.buckets) : null;
  const allowedClubs = rules.clubFilter.kind === "clubs" ? new Set(rules.clubFilter.ids) : null;
  const allowedNations = rules.nationFilter.kind === "nations" ? new Set(rules.nationFilter.ids) : null;
  const pool = erasForEngine(engineVersion).filter(
    (e) =>
      (rules.pool === "all" || e.kind === rules.pool) &&
      (!allowedBuckets || allowedBuckets.has(e.bucket)) &&
      (!allowedClubs || e.kind !== "club" || allowedClubs.has(e.clubId)) &&
      (!allowedNations || e.kind !== "nation" || allowedNations.has(e.clubId)) &&
      (!club || e.clubId === club) &&
      (!countries || countries.has(getClub(e.clubId).country)) &&
      (!rules.championsOnly || e.europeanCups.length > 0),
  );
  if (club && pool.length === 0) throw new Error(`No eras for club ${club}`);
  const primary = rng.shuffle(bucket ? pool.filter((e) => e.bucket === bucket) : pool);
  // Engine v6 spotlight: guaranteed rounds from the featured side(s). No RNG is drawn without it,
  // so every non-themed draw is byte-identical to what it would be without this code.
  let featuredRounds: Set<number> | null = null;
  let featuredList: ClubEra[] = [];
  const featured = Number(engineVersion) >= 6 ? rules.featured : null;
  if (featured && featured.rounds > 0) {
    const teamSet = featured.teams ? new Set(featured.teams) : null;
    const countrySet = featured.countries ? new Set(featured.countries) : null;
    featuredList = primary.filter((e) => (teamSet?.has(e.clubId) ?? false) || (countrySet?.has(getClub(e.clubId).country) ?? false));
    featuredRounds = new Set<number>();
    const n = Math.min(featured.rounds, featuredList.length, ROUNDS);
    while (featuredRounds.size < n) featuredRounds.add(rng.int(ROUNDS));
  }
  // Safety net for thin periods: neighbouring eras only if the locked period runs dry.
  const fallback = bucket ? rng.shuffle(pool.filter((e) => e.bucket !== bucket)) : [];

  // Engine v4: structured offers (Draft Director) unless the ruleset asks for naive draws.
  const directed = Number(engineVersion) >= 4 && rules.offerDirector !== "naive";
  const maxSame = Number(engineVersion) >= 4 ? rules.maxSameTeam : MAX_SAME_CLUB;
  // One Club: the same era may return (with different players); least-used eras first.
  const reuseEras = club !== null;
  const eraUses = new Map<string, number>();
  const clubCount = new Map<string, number>();
  const usedEras = new Set<string>();
  const usedPlayers = new Set<string>();
  const offers: DraftOffer[] = [];
  let gkDebt = 0;

  const tryList = (list: readonly ClubEra[], wantGk: boolean) => {
    let built: { offer: DraftOffer; gotGk: boolean } | null = null;
    const ordered = reuseEras ? [...list].sort((a, b) => (eraUses.get(a.id) ?? 0) - (eraUses.get(b.id) ?? 0)) : list;
    for (const era of ordered) {
      if (!reuseEras && usedEras.has(era.id)) continue;
      if (!reuseEras && (clubCount.get(era.clubId) ?? 0) >= maxSame) continue;
      const attempt = directed
        ? buildDirectedOffer(rng, era, wantGk, usedPlayers, rules.choiceCount, rules.maxOverall, exclude, Number(engineVersion) >= 5 ? Number(engineVersion) : 0)
        : buildOffer(rng, era, wantGk, usedPlayers, rules.choiceCount, rules.maxOverall, exclude);
      if (!attempt) continue;
      if (wantGk && !attempt.gotGk) {
        built ??= attempt;
        continue;
      }
      return attempt;
    }
    return built;
  };

  for (let i = 0; i < total; i++) {
    const scheduledGk = i < ROUNDS ? gkRounds.has(i) : reserveWantsGk;
    const wantGk = scheduledGk || gkDebt > 0;
    const built = (featuredRounds?.has(i) ? tryList(featuredList, wantGk) : null) ?? tryList(primary, wantGk) ?? tryList(fallback, wantGk);
    if (!built && i === ROUNDS && reuseEras) {
      // One Club has no reroll, so the reserve is never shown: don't fail a thin club on it.
      offers.push(offers[0]!);
      break;
    }
    if (!built) throw new Error("Draft generation exhausted the era pool");
    const era = getClubEra(built.offer.clubEraId);
    usedEras.add(era.id);
    eraUses.set(era.id, (eraUses.get(era.id) ?? 0) + 1);
    clubCount.set(era.clubId, (clubCount.get(era.clubId) ?? 0) + 1);
    for (const id of built.offer.options) usedPlayers.add(getPlayerEra(id).playerId);
    if (wantGk && !built.gotGk) gkDebt++;
    else if (built.gotGk && gkDebt > 0 && !scheduledGk) gkDebt--;
    offers.push(built.offer);
  }

  const reserve = offers.pop();
  if (!reserve || offers.length !== ROUNDS) throw new Error("Draft generation failed");
  const draw: DraftDraw = { seed, engineVersion, bucket, clubId: club, targets: null, rounds: offers, reserve };
  if (league) draw.league = league;
  return draw;
}

/** Position Draft needs at least this many players who can genuinely play the named slot. */
const MIN_POSITION_OPTIONS = 2;

/**
 * Position Draft: the formation's 11 slots in a seeded order; each round offers players
 * from one era who can play that slot (natural, secondary or twin position). Keepers are
 * rare inside one squad, so a round may offer 2–4 players.
 */
function generatePositionDraw(seed: string, engineVersion: string, rules: DrawRules, ctx: DrawContext): DraftDraw {
  if (!ctx.formation) throw new Error("Position Draft needs the formation");
  const formation = getFormation(ctx.formation);
  const rng = rngFor(seed, "position-draw", engineVersion);
  const targets = rng.shuffle(formation.slots.map((_, i) => i));
  const pool = rng.shuffle(erasForEngine(engineVersion).filter((e) => e.kind === "club"));
  const usedEras = new Set<string>();
  const clubCount = new Map<string, number>();
  const usedPlayers = new Set<string>();
  const offers: DraftOffer[] = [];

  const offerFor = (slot: Position): DraftOffer | null => {
    for (const era of pool) {
      if (usedEras.has(era.id) || (clubCount.get(era.clubId) ?? 0) >= MAX_SAME_CLUB) continue;
      const fits = era.playerEraIds
        .map(getPlayerEra)
        .filter((p) => !usedPlayers.has(p.playerId) && (rules.maxOverall === null || p.overall <= rules.maxOverall))
        .filter((p) => positionFamiliarity(p.positions, slot) >= OUT_OF_POSITION_THRESHOLD);
      if (fits.length < MIN_POSITION_OPTIONS) continue;
      const chosen: PlayerEra[] = [];
      while (chosen.length < Math.min(rules.choiceCount, fits.length)) {
        const rest = fits.filter((p) => !chosen.includes(p));
        const p = pickWeighted(rng, rest, (x) => starWeight(x) * (x.positions[0] === slot ? 1.4 : 1));
        if (!p) break;
        chosen.push(p);
      }
      chosen.sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
      usedEras.add(era.id);
      clubCount.set(era.clubId, (clubCount.get(era.clubId) ?? 0) + 1);
      for (const p of chosen) usedPlayers.add(p.playerId);
      return { clubEraId: era.id, options: chosen.map((p) => p.id) };
    }
    return null;
  };

  for (const t of targets) {
    const slot = formation.slots[t];
    const offer = slot ? offerFor(slot.position) : null;
    if (!offer) throw new Error("Position Draft exhausted the era pool");
    offers.push(offer);
  }
  const reserveSlot = formation.slots[targets[0] ?? 0]!;
  const reserve = offerFor(reserveSlot.position) ?? offers[0]!;
  return { seed, engineVersion, bucket: null, clubId: null, targets, rounds: offers, reserve };
}
