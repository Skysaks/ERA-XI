import type { EraMetaRaw } from "./types";

export const META: Record<string, EraMetaRaw> = {
  "juventus-1976": {
    coach: ["Giovanni Trapattoni"],
    honours: [["league", 1977], ["league", 1978], ["uefa-cup", 1977]],
    src: [
      "https://en.wikipedia.org/wiki/1977%E2%80%9378_Juventus_FC_season",
      "https://en.wikipedia.org/wiki/1976%E2%80%9377_Juventus_FC_season",
      "https://en.wikipedia.org/wiki/1977_UEFA_Cup_final",
    ],
  },
  "roma-1982": {
    coach: ["Nils Liedholm"],
    honours: [["league", 1983], ["cup", 1984]],
    style: "possession",
    src: [
      "https://en.wikipedia.org/wiki/1982%E2%80%9383_AS_Roma_season",
      "https://en.wikipedia.org/wiki/1983%E2%80%9384_AS_Roma_season",
      "https://en.wikipedia.org/wiki/1984_Coppa_Italia_final",
      "https://en.wikipedia.org/wiki/1984_European_Cup_final",
    ],
  },
  "verona-1984": {
    coach: ["Osvaldo Bagnoli"],
    honours: [["league", 1985]],
    style: "counter",
    src: ["https://en.wikipedia.org/wiki/1984%E2%80%9385_Hellas_Verona_season"],
  },
  "lazio-1973": {
    coach: ["Tommaso Maestrelli"],
    honours: [["league", 1974]],
    src: ["https://en.wikipedia.org/wiki/1973%E2%80%9374_SS_Lazio_season"],
  },
  "hamburg-1976": {
    coach: ["Kuno Klötzer", "Branko Zebec"],
    honours: [["cwc", 1977], ["league", 1979]],
    src: [
      "https://en.wikipedia.org/wiki/1976%E2%80%9377_Hamburger_SV_season",
      "https://en.wikipedia.org/wiki/1977_European_Cup_Winners%27_Cup_final",
      "https://en.wikipedia.org/wiki/1978%E2%80%9379_Bundesliga",
    ],
  },
  "kaiserslautern-1997": {
    coach: ["Otto Rehhagel"],
    honours: [["league", 1998]],
    style: "counter",
    src: ["https://en.wikipedia.org/wiki/1997%E2%80%9398_1._FC_Kaiserslautern_season"],
  },
  "west-germany-1972": {
    coach: ["Helmut Schön"],
    honours: [["euro", 1972]],
    style: "possession",
    src: ["https://en.wikipedia.org/wiki/UEFA_Euro_1972_squads"],
  },
  "germany-1996": {
    coach: ["Berti Vogts"],
    honours: [["euro", 1996]],
    src: ["https://en.wikipedia.org/wiki/UEFA_Euro_1996_squads"],
  },
};
