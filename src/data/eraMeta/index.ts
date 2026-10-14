/**
 * Era context for every team era (coach, honours won inside the span, documented style, sources).
 * Its own chunk: loaded when idle, never on the draft path. See ./types.ts for the rules.
 */
import type { EraMetaRaw } from "./types";
import { META as P1 } from "./part-1";
import { META as P2 } from "./part-2";
import { META as P3 } from "./part-3";
import { META as P4 } from "./part-4";
import { META as P5 } from "./part-5";
import { META as AFRICA } from "./world-africa";
import { META as AMERICAS } from "./world-americas";
import { META as ASIA } from "./world-asia";
import { META as V2A } from "./v2-britain";
import { META as V2B } from "./v2-iberia";
import { META as V2C } from "./v2-italy-germany";
import { META as V2D } from "./v2-france-lowlands";
import { META as V2E } from "./v2-east";
import { META as V2F } from "./v2-americas-africa";

export const ERA_META: Record<string, EraMetaRaw> = { ...P1, ...P2, ...P3, ...P4, ...P5, ...AFRICA, ...AMERICAS, ...ASIA, ...V2A, ...V2B, ...V2C, ...V2D, ...V2E, ...V2F };
export type { EraMetaRaw, HonourCode, StyleTag } from "./types";
