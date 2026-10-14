import type { RawEra } from "./types";
import { ERAS as PRE1980 } from "./pre1980";
import { ERAS as E1980S } from "./1980s";
import { ERAS as E1990S } from "./1990s";
import { ERAS as E2000S } from "./2000s";
import { ERAS as E2010S } from "./2010s";
import { ERAS as E2020S } from "./2020s";
import { ERAS as NATIONS } from "./nations";
import { ERAS as MORE_PRE1980 } from "./more-pre1980";
import { ERAS as MORE_1980S } from "./more-1980s";
import { ERAS as MORE_1990S } from "./more-1990s";
import { ERAS as MORE_2000S } from "./more-2000s";
import { ERAS as MORE_2010S } from "./more-2010s";
import { ERAS as MORE_2020S } from "./more-2020s";
import { ERAS as MORE_NATIONS } from "./more-nations";
import { ERAS as MORE_NATIONS2 } from "./more-nations2";
import { ERAS as WORLD_AFRICA } from "./world-africa";
import { ERAS as WORLD_AMERICAS } from "./world-americas";
import { ERAS as WORLD_ASIA } from "./world-asia";
import { ERAS as V2_BRITAIN } from "./v2-britain";
import { ERAS as V2_IBERIA } from "./v2-iberia";
import { ERAS as V2_ITGER } from "./v2-italy-germany";
import { ERAS as V2_FRLOW } from "./v2-france-lowlands";
import { ERAS as V2_EAST } from "./v2-east";
import { ERAS as V2_AMAF } from "./v2-americas-africa";

/** Per-file groups (used by the data validator to report where a problem lives). */
export const ERA_FILES: Record<string, readonly RawEra[]> = {
  pre1980: PRE1980, "1980s": E1980S, "1990s": E1990S, "2000s": E2000S, "2010s": E2010S, "2020s": E2020S, nations: NATIONS,
  "more-pre1980": MORE_PRE1980, "more-1980s": MORE_1980S, "more-1990s": MORE_1990S, "more-2000s": MORE_2000S,
  "more-2010s": MORE_2010S, "more-2020s": MORE_2020S, "more-nations": MORE_NATIONS, "more-nations2": MORE_NATIONS2,
  "world-africa": WORLD_AFRICA, "world-americas": WORLD_AMERICAS, "world-asia": WORLD_ASIA,
  "v2-britain": V2_BRITAIN, "v2-iberia": V2_IBERIA, "v2-italy-germany": V2_ITGER, "v2-france-lowlands": V2_FRLOW, "v2-east": V2_EAST, "v2-americas-africa": V2_AMAF,
};

/**
 * All authored eras. Files are split by period so the dataset can grow to thousands
 * of PlayerEras (and later be code-split or fetched per bucket) without one giant file.
 */
export const RAW_ERAS: readonly RawEra[] = Object.values(ERA_FILES).flat();
export type { RawEra };
