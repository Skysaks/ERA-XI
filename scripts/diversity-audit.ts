/**
 * DIVERSITY AUDIT — who actually appears in drafts, over many simulated runs.
 *
 *   node scripts/run-ts.mjs scripts/diversity-audit.ts [drafts] [engineVersion]
 *
 * Reports, per identity (all versions of a player together): share of drafts in which he is
 * OFFERED at least once, share of drafts in which a competent drafter PICKS him; the same for
 * eras and roles; concentration (how much of all offers the top 1% / 5% of players take), and
 * a "usual suspects" check (Messi, Cristiano, Zidane, Ronaldinho, Henry).
 * Modes: classic, eralock (random period), nations, cult, champions.
 */
import { autoPlace, createDraft, currentOffer, formationOf, getFormation, isDraftComplete, lineupPlayers, pickOption, rateLineup } from "@/engine";
import { ALL_CLUB_ERAS, ALL_PLAYER_IDS, getClub, getClubEra, getPlayerEra, loadNationality, nationOf } from "@/data";
import type { DraftState, FormationId, ModeId } from "@/types";

const N = Number(process.argv[3] ?? 2000);
const V = process.argv[4] ?? "4";
const FORMS: FormationId[] = ["433", "4231", "442", "352", "343", "4312", "532"];

function competent(s: DraftState): number {
  const offer = currentOffer(s)!;
  const f = getFormation(formationOf(s));
  const before = lineupPlayers(s);
  const hasGk = before.some((p) => p?.positions[0] === "GK");
  let best = 0, bestV = -Infinity;
  offer.options.forEach((id, i) => {
    const p = getPlayerEra(id);
    if (before.some((x) => x?.playerId === p.playerId)) return;
    const after = autoPlace(before, p, f);
    const r = rateLineup(after, f, V);
    const n = after.filter(Boolean).length;
    let v = r.overall * n + r.fit * 0.6 * (n / 11) * 5;
    if (!hasGk && p.positions[0] === "GK" && 11 - s.round <= 5) v += 400;
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
}

await loadNationality();
const MODES: ModeId[] = ["classic", "classic", "classic", "eralock", "nations", "cult", "champions"];
const peOffered = new Map<string, number>();
const clubDrafts = new Map<string, number>();
const nationOptions = new Map<string, number>();
const bucketOptions = new Map<string, number>();
const posOptions = new Map<string, number>();
const overlaps: number[] = [];
let prevSeen: Set<string> | null = null;
const cumulative = new Set<string>();
const curve: [number, number][] = [];
const CURVE_AT = new Set([10, 25, 50, 100, 200, 500, 1000]);
const offered = new Map<string, number>();
const picked = new Map<string, number>();
const eraSeen = new Map<string, number>();
const roleOffers = new Map<string, number>();
const roleDataset = new Map<string, number>();
const tierOffers = { "95+": 0, "90–94": 0, "85–89": 0, "<85": 0 };
let optionsTotal = 0;
const t0 = Date.now();
for (let k = 0; k < N; k++) {
  const mode = MODES[k % MODES.length]!;
  let s = createDraft({ seed: `divaudit${k}`, formation: FORMS[k % FORMS.length]!, mode, engineVersion: V });
  const seenThis = new Set<string>();
  const pickedThis = new Set<string>();
  const peThis = new Set<string>();
  const clubsThis = new Set<string>();
  while (!isDraftComplete(s)) {
    const offer = currentOffer(s)!;
    eraSeen.set(offer.clubEraId, (eraSeen.get(offer.clubEraId) ?? 0) + 1);
    const era = getClubEra(offer.clubEraId);
    clubsThis.add(era.clubId);
    for (const id of offer.options) {
      const p = getPlayerEra(id);
      seenThis.add(p.playerId);
      peThis.add(p.id);
      optionsTotal++;
      const nat = nationOf(p.playerId)?.code ?? "?";
      nationOptions.set(nat, (nationOptions.get(nat) ?? 0) + 1);
      bucketOptions.set(era.bucket, (bucketOptions.get(era.bucket) ?? 0) + 1);
      posOptions.set(p.positions[0]!, (posOptions.get(p.positions[0]!) ?? 0) + 1);
      roleOffers.set(p.roles[0]!, (roleOffers.get(p.roles[0]!) ?? 0) + 1);
      tierOffers[p.overall >= 95 ? "95+" : p.overall >= 90 ? "90–94" : p.overall >= 85 ? "85–89" : "<85"]++;
    }
    const i = competent(s);
    pickedThis.add(getPlayerEra(offer.options[i]!).playerId);
    s = pickOption(s, i).state;
  }
  for (const id of seenThis) offered.set(id, (offered.get(id) ?? 0) + 1);
  for (const id of peThis) peOffered.set(id, (peOffered.get(id) ?? 0) + 1);
  for (const id of clubsThis) clubDrafts.set(id, (clubDrafts.get(id) ?? 0) + 1);
  // Consecutive games of the same player: how much of this draft's cast he already met last game.
  if (prevSeen) overlaps.push([...seenThis].filter((x) => prevSeen!.has(x)).length / Math.max(1, seenThis.size));
  prevSeen = seenThis;
  for (const id of seenThis) cumulative.add(id);
  if (CURVE_AT.has(k + 1)) curve.push([k + 1, cumulative.size]);
  for (const id of pickedThis) picked.set(id, (picked.get(id) ?? 0) + 1);
}
const tierDataset = { "95+": 0, "90–94": 0, "85–89": 0, "<85": 0 };
let peTotal = 0;
for (const e of ALL_CLUB_ERAS)
  if (e.since <= Number(V))
    for (const id of e.playerEraIds) {
      const p = getPlayerEra(id);
      peTotal++;
      roleDataset.set(p.roles[0]!, (roleDataset.get(p.roles[0]!) ?? 0) + 1);
      tierDataset[p.overall >= 95 ? "95+" : p.overall >= 90 ? "90–94" : p.overall >= 85 ? "85–89" : "<85"]++;
    }

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const sortedOffers = [...offered.values()].sort((a, b) => b - a);
const totalOfferDraws = sortedOffers.reduce((a, b) => a + b, 0);
const topShare = (q: number) => sortedOffers.slice(0, Math.ceil(ALL_PLAYER_IDS.length * q)).reduce((a, b) => a + b, 0) / totalOfferDraws;
let md = `## Diversity audit (engine v${V}, ${N} drafts: classic ×3, eralock, nations, cult, champions; 7 formations)\n\n`;
md += `- Distinct players offered at least once: ${offered.size} of ${ALL_PLAYER_IDS.length} (${pct(offered.size / ALL_PLAYER_IDS.length)}); picked at least once: ${picked.size}.\n`;
md += `- Concentration: the top 1% of players take ${pct(topShare(0.01))} of all "player seen in a draft" events, the top 5% take ${pct(topShare(0.05))} (uniform would be 1% / 5%).\n`;
md += `- Distinct team eras drawn: ${eraSeen.size} of ${ALL_CLUB_ERAS.filter((e) => e.since <= Number(V)).length}.\n\n`;
md += `### Rating tiers: share of options shown vs share of the dataset\n\n| tier | options shown | dataset |\n|---|---|---|\n`;
for (const k of Object.keys(tierOffers) as (keyof typeof tierOffers)[]) md += `| ${k} | ${pct(tierOffers[k] / optionsTotal)} | ${pct(tierDataset[k] / peTotal)} |\n`;
md += `\n### Most frequently offered players (share of drafts in which they appear at least once)\n\n| player | offered | picked (competent) |\n|---|---|---|\n`;
for (const [id, n] of [...offered].sort((a, b) => b[1] - a[1]).slice(0, 20)) md += `| ${id} | ${pct(n / N)} | ${pct((picked.get(id) ?? 0) / N)} |\n`;
md += `\n### The usual suspects\n\n| player | offered | picked |\n|---|---|---|\n`;
for (const id of ["messi", "cristiano-ronaldo", "zidane", "ronaldinho", "henry", "maradona", "pele", "cruyff"]) md += `| ${id} | ${pct((offered.get(id) ?? 0) / N)} | ${pct((picked.get(id) ?? 0) / N)} |\n`;
md += `\n### Roles: share of options shown vs share of the dataset\n\n| role | shown | dataset |\n|---|---|---|\n`;
for (const [r, n] of [...roleDataset].sort((a, b) => b[1] - a[1])) md += `| ${r} | ${pct((roleOffers.get(r) ?? 0) / optionsTotal)} | ${pct(n / peTotal)} |\n`;
md += `\n### Most drawn team eras (share of drafts)\n\n`;
md += [...eraSeen].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => { const e = getClubEra(id); return `${getClub(e.clubId).name} ${e.label} ${pct(n / N)}`; }).join(" · ");
const peDataset = ALL_CLUB_ERAS.filter((e) => e.since <= Number(V)).reduce((a, e) => a + e.playerEraIds.length, 0);
md += `\n\n### Coverage & repetition\n\n`;
md += `- Distinct PlayerEras offered: ${peOffered.size} of ${peDataset} (${pct(peOffered.size / peDataset)}).\n`;
const avgOverlap = overlaps.reduce((a, b) => a + b, 0) / Math.max(1, overlaps.length);
md += `- Consecutive games: on average ${pct(avgOverlap)} of the players met in a draft were already met in the previous one (${overlaps.filter((o) => o >= 0.2).length} of ${overlaps.length} pairs ≥ 20%).\n`;
md += `- Discovery curve (distinct players met by one player after n games): ${curve.map(([n, c]) => `${n} → ${c}`).join(" · ")}.\n`;
const flagsPe = [...peOffered].filter(([, n]) => n / N > 0.1);
const flagsId = [...offered].filter(([, n]) => n / N > 0.15);
md += `- Repetition flags: PlayerEras offered in >10% of drafts: ${flagsPe.length ? flagsPe.map(([id, n]) => `${id} ${pct(n / N)}`).join(", ") : "none"}; identities offered in >15% of drafts: ${flagsId.length ? flagsId.map(([id, n]) => `${id} ${pct(n / N)}`).join(", ") : "none"}.\n`;
md += `\n### Top 25 PlayerEras (share of drafts in which offered)\n\n`;
md += [...peOffered].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([id, n]) => `${id} ${pct(n / N)}`).join(" · ");
md += `\n\n### Clubs & nations (${clubDrafts.size} teams drawn)\n\n`;
md += `Most frequent teams (share of drafts): ${[...clubDrafts].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, n]) => `${getClub(id).name} ${pct(n / N)}`).join(" · ")}\n\n`;
md += `Players' nationalities (share of options): ${[...nationOptions].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([c, n]) => `${c} ${pct(n / optionsTotal)}`).join(" · ")} · ${nationOptions.size} nationalities in total\n\n`;
md += `Periods (share of options): ${[...bucketOptions].sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} ${pct(n / optionsTotal)}`).join(" · ")}\n\n`;
md += `Natural positions (share of options): ${[...posOptions].sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} ${pct(n / optionsTotal)}`).join(" · ")}\n`;
md += `\n\n(${((Date.now() - t0) / 1000).toFixed(0)}s)\n`;
console.log(md);
