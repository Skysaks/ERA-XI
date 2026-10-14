import type { DraftState, TacticalDimension, TeamRatings } from "@/types";
import { getClubEra, getClub, getPlayerEra } from "@/data";
import { draftRatings } from "./draft";
import { labSwap } from "./draftLab";
import { expectedSeason } from "./simulation";
import { enText, msg, type Msg } from "@/i18n";

export interface PickDifference {
  round: number; // 1-based for display
  context: string; // "Barcelona 2008–2012"
  theirs: string;
  yours: string;
  weight: number;
  /**
   * Your pick versus theirs, everything else in your draft held equal (auto-placement):
   * positive = your choice was better on that axis. Null when the two of you saw
   * different offers that round (one rerolled).
   */
  impact: { att: number; mid: number; def: number; fit: number; pts: number } | null;
  /** One deterministic line, e.g. "Modrić over Benzema: MID +4, ATT −3 → +2 pts". */
  summary: string;
  summaryMsg: Msg;
}

export interface RivalComparison {
  yourScore: number;
  theirScore: number;
  outcome: "win" | "loss" | "draw";
  differences: PickDifference[];
  /** The single choice that moved your season most, if any moved it. */
  decisive: PickDifference | null;
  summary: string[];
  summaryMsgs: Msg[];
}

type Axis = "att" | "mid" | "def" | TacticalDimension;

const AXIS_PHRASE: Partial<Record<Axis, string>> = {
  att: "attacking threat",
  mid: "midfield quality",
  def: "defensive solidity",
  coverage: "defensive coverage",
  creation: "creation",
  finishing: "finishing",
  width: "width",
  ballWinning: "ball-winning",
  retention: "control",
  pace: "pace",
  aerial: "aerial presence",
  progression: "ball progression",
  buildUp: "build-up quality",
};

function axisValue(r: TeamRatings, a: Axis): number {
  if (a === "att" || a === "mid" || a === "def") return r[a];
  return r.dims[a];
}

/**
 * Head-to-head readout after a challenge. Differences are real decisions
 * (same round, different pick), ranked by how much they changed the XI.
 */
export function compareRuns(
  yours: { state: DraftState; ratings: TeamRatings; points: number },
  theirs: { state: DraftState; ratings: TeamRatings; points: number },
  theirName: string,
  limit = 3,
): RivalComparison {
  const diffs: PickDifference[] = [];
  let baseline: { r: TeamRatings; pts: number } | null = null;
  // Estimates: expected points of your XI vs your XI with their pick swapped in (same formation,
  // best arrangement of both), from the season model's exact expectation — not a replayed season.
  const getBaseline = () => {
    if (!baseline) {
      const r = draftRatings(yours.state);
      baseline = { r, pts: expectedSeason(r, yours.state.config.seed, yours.state.config.engineVersion).expected };
    }
    return baseline;
  };

  for (let i = 0; i < Math.min(yours.state.picks.length, theirs.state.picks.length); i++) {
    const y = yours.state.picks[i];
    const t = theirs.state.picks[i];
    if (!y || !t || y.playerEraId === t.playerEraId) continue;
    const yp = getPlayerEra(y.playerEraId);
    const tp = getPlayerEra(t.playerEraId);
    const era = getClubEra(yp.clubEraId === tp.clubEraId ? yp.clubEraId : tp.clubEraId);

    let impact: PickDifference["impact"] = null;
    const sameOffer = (yours.state.rerollRound === i) === (theirs.state.rerollRound === i);
    if (sameOffer) {
      try {
        const cf = labSwap(yours.state, i, t.playerEraId);
        const b = getBaseline();
        impact = { att: b.r.att - cf.ratings.att, mid: b.r.mid - cf.ratings.mid, def: b.r.def - cf.ratings.def, fit: b.r.fit - cf.ratings.fit, pts: Math.round((b.pts - cf.expected) * 10) / 10 };
      } catch {
        impact = null;
      }
    }
    const lineChange = yp.positions[0] !== tp.positions[0] ? 6 : 0;
    const summaryMsg = pickSummary(yp.name, tp.name, impact);
    diffs.push({
      summary: enText(summaryMsg),
      summaryMsg,
      round: i + 1,
      context: `${getClub(era.clubId).name} ${era.label}`,
      theirs: tp.name,
      yours: yp.name,
      weight: impact ? Math.abs(impact.pts) * 3 + Math.abs(impact.fit) + Math.abs(impact.att) + Math.abs(impact.def) : Math.abs(yp.overall - tp.overall) + lineChange,
      impact,
    });
  }
  const ranked = diffs.slice().sort((a, b) => b.weight - a.weight);
  const decisive = ranked.find((d) => d.impact && Math.abs(d.impact.pts) >= 0.5) ?? null;
  const differences = ranked.slice(0, limit).sort((a, b) => a.round - b.round);

  const axes = Object.keys(AXIS_PHRASE) as Axis[];
  const deltas = axes
    .map((a) => ({ a, d: axisValue(yours.ratings, a) - axisValue(theirs.ratings, a) }))
    .sort((x, y) => y.d - x.d);
  const summaryMsgs: Msg[] = [];
  const best = deltas[0];
  const worst = deltas[deltas.length - 1];
  if (best && best.d >= 2) summaryMsgs.push(msg("cmp.gainedMore", { axis: `@axis.${best.a}` }));
  if (worst && worst.d <= -2) summaryMsgs.push(msg("cmp.theyBuilt", { name: theirName, axis: `@axis.${worst.a}` }));
  if (summaryMsgs.length === 0) summaryMsgs.push(msg("cmp.similar"));
  const summary = summaryMsgs.map(enText);

  const outcome = yours.points > theirs.points ? "win" : yours.points < theirs.points ? "loss" : "draw";
  return { yourScore: yours.points, theirScore: theirs.points, outcome, differences, decisive, summary, summaryMsgs };
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");

function pickSummary(yours: string, theirs: string, impact: PickDifference["impact"]): Msg {
  if (!impact) return msg("cmp.reroll", { yours, theirs });
  const axes = (
    [
      ["ATT", impact.att],
      ["MID", impact.mid],
      ["DEF", impact.def],
      ["FIT", impact.fit],
    ] as const
  )
    .filter(([, v]) => Math.abs(v) >= 1)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2)
    .map(([k, v]) => `${k} ${signed(v)}`);
  const pts = Math.abs(impact.pts) < 0.5 ? "@cmp.noChange" : `${signed(impact.pts)} pts`;
  return axes.length ? msg("cmp.pick", { yours, theirs, axes: axes.join(", "), pts }) : msg("cmp.pickNoAxes", { yours, theirs, pts });
}
