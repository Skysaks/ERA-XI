/**
 * FOOTBALL FACTS — structured, sourced, auditable.
 *
 * Only facts that can be checked against a public record are stored here, as data (not prose):
 * tournament results of the national-team eras, European Cups (src/data/champions.ts), Ballon
 * d'Or years. The UI turns them into short localized sentences; no fact is ever generated.
 * Every fact carries a source id (SOURCES); `checked` records how it was verified.
 */
import { getClubEra, playerIdOf } from "@/data";

export interface Source {
  id: string;
  publisher: string;
  title: string;
  url: string;
  /** How the data was checked: "editorial" = authored from the record, "fetched" = compared with the page on `checkedOn`. */
  checked: "editorial" | "fetched";
  checkedOn: string;
}

export const SOURCES: Record<string, Source> = {
  wcTop4: {
    id: "wcTop4",
    publisher: "Wikipedia (FIFA records)",
    title: "FIFA World Cup — champions, runners-up, third and fourth places",
    url: "https://en.wikipedia.org/wiki/FIFA_World_Cup",
    checked: "fetched",
    checkedOn: "2026-09-24",
  },
  wcRounds: {
    id: "wcRounds",
    publisher: "FIFA",
    title: "FIFA World Cup tournament records (elimination rounds)",
    url: "https://www.fifa.com/",
    checked: "editorial",
    checkedOn: "2026-09-24",
  },
  euroFinals: {
    id: "euroFinals",
    publisher: "Wikipedia (UEFA records)",
    title: "List of UEFA European Championship finals",
    url: "https://en.wikipedia.org/wiki/List_of_UEFA_European_Championship_finals",
    checked: "fetched",
    checkedOn: "2026-09-24",
  },
  copa: {
    id: "copa",
    publisher: "Wikipedia (CONMEBOL records)",
    title: "Copa América",
    url: "https://en.wikipedia.org/wiki/Copa_Am%C3%A9rica",
    checked: "editorial",
    checkedOn: "2026-09-24",
  },
  afcon: {
    id: "afcon",
    publisher: "Wikipedia (CAF records)",
    title: "Africa Cup of Nations — finals",
    url: "https://en.wikipedia.org/wiki/Africa_Cup_of_Nations",
    checked: "editorial",
    checkedOn: "2026-09-27",
  },
  olympics: {
    id: "olympics",
    publisher: "Wikipedia (IOC / FIFA records)",
    title: "Football at the Summer Olympics — men's tournament",
    url: "https://en.wikipedia.org/wiki/Football_at_the_Summer_Olympics",
    checked: "editorial",
    checkedOn: "2026-09-27",
  },
  ucl: {
    id: "ucl",
    publisher: "Wikipedia (UEFA records)",
    title: "List of European Cup and UEFA Champions League finals",
    url: "https://en.wikipedia.org/wiki/List_of_European_Cup_and_UEFA_Champions_League_finals",
    checked: "fetched",
    checkedOn: "2026-09-24",
  },
  ballonDor: {
    id: "ballonDor",
    publisher: "Wikipedia (France Football records)",
    title: "Ballon d'Or",
    url: "https://en.wikipedia.org/wiki/Ballon_d%27Or",
    checked: "fetched",
    checkedOn: "2026-09-24",
  },
};

export type Tournament = "wc" | "euro" | "copa" | "afcon" | "olympics";
export type Finish = "winner" | "final" | "third" | "fourth" | "semi" | "quarter" | "r16" | "secondRound" | "group";

/** What each national-team era in the dataset did at the tournament it represents. */
export const NATION_ERA_RESULTS: Record<string, { tournament: Tournament; year: number; finish: Finish }> = {
  "uruguay-1950": { tournament: "wc", year: 1950, finish: "winner" },
  // V2.0 eras (tournament results: World Cup / Euro finals pages, CAF and Olympic records).
  "ussr-1960": { tournament: "euro", year: 1960, finish: "winner" },
  "west-germany-1972": { tournament: "euro", year: 1972, finish: "winner" },
  "poland-1982": { tournament: "wc", year: 1982, finish: "third" },
  "argentina-1990": { tournament: "wc", year: 1990, finish: "final" },
  "romania-1994": { tournament: "wc", year: 1994, finish: "quarter" },
  "germany-1996": { tournament: "euro", year: 1996, finish: "winner" },
  "czech-republic-1996": { tournament: "euro", year: 1996, finish: "final" },
  "nigeria-1996": { tournament: "olympics", year: 1996, finish: "winner" },
  "netherlands-1998": { tournament: "wc", year: 1998, finish: "fourth" },
  "turkey-2002": { tournament: "wc", year: 2002, finish: "third" },
  "portugal-2004": { tournament: "euro", year: 2004, finish: "final" },
  "france-2006": { tournament: "wc", year: 2006, finish: "final" },
  "russia-2008": { tournament: "euro", year: 2008, finish: "semi" },
  "zambia-2012": { tournament: "afcon", year: 2012, finish: "winner" },
  "hungary-1954": { tournament: "wc", year: 1954, finish: "final" },
  "brazil-1958": { tournament: "wc", year: 1958, finish: "winner" },
  "england-1966": { tournament: "wc", year: 1966, finish: "winner" },
  "brazil-1970": { tournament: "wc", year: 1970, finish: "winner" },
  "netherlands-1974": { tournament: "wc", year: 1974, finish: "final" },
  "west-germany-1974": { tournament: "wc", year: 1974, finish: "winner" },
  "poland-1974": { tournament: "wc", year: 1974, finish: "third" },
  "czechoslovakia-1976": { tournament: "euro", year: 1976, finish: "winner" },
  "argentina-1978": { tournament: "wc", year: 1978, finish: "winner" },
  "italy-1982": { tournament: "wc", year: 1982, finish: "winner" },
  "brazil-1982": { tournament: "wc", year: 1982, finish: "secondRound" },
  "france-1984": { tournament: "euro", year: 1984, finish: "winner" },
  "argentina-1986": { tournament: "wc", year: 1986, finish: "winner" },
  "ussr-1988": { tournament: "euro", year: 1988, finish: "final" },
  "netherlands-1988": { tournament: "euro", year: 1988, finish: "winner" },
  "west-germany-1990": { tournament: "wc", year: 1990, finish: "winner" },
  "cameroon-1990": { tournament: "wc", year: 1990, finish: "quarter" },
  "italy-1990": { tournament: "wc", year: 1990, finish: "third" },
  "denmark-1992": { tournament: "euro", year: 1992, finish: "winner" },
  "brazil-1994": { tournament: "wc", year: 1994, finish: "winner" },
  "italy-1994": { tournament: "wc", year: 1994, finish: "final" },
  "bulgaria-1994": { tournament: "wc", year: 1994, finish: "fourth" },
  "sweden-1994": { tournament: "wc", year: 1994, finish: "third" },
  "colombia-1994": { tournament: "wc", year: 1994, finish: "group" },
  "nigeria-1994": { tournament: "wc", year: 1994, finish: "r16" },
  "france-1998": { tournament: "wc", year: 1998, finish: "winner" },
  "croatia-1998": { tournament: "wc", year: 1998, finish: "third" },
  "france-2000": { tournament: "euro", year: 2000, finish: "winner" },
  "brazil-2002": { tournament: "wc", year: 2002, finish: "winner" },
  "south-korea-2002": { tournament: "wc", year: 2002, finish: "fourth" },
  "senegal-2002": { tournament: "wc", year: 2002, finish: "quarter" },
  "greece-2004": { tournament: "euro", year: 2004, finish: "winner" },
  "italy-2006": { tournament: "wc", year: 2006, finish: "winner" },
  "portugal-2006": { tournament: "wc", year: 2006, finish: "fourth" },
  "spain-2010": { tournament: "wc", year: 2010, finish: "winner" },
  "netherlands-2010": { tournament: "wc", year: 2010, finish: "final" },
  "uruguay-2010": { tournament: "wc", year: 2010, finish: "fourth" },
  "germany-2014": { tournament: "wc", year: 2014, finish: "winner" },
  "argentina-2014": { tournament: "wc", year: 2014, finish: "final" },
  "chile-2015": { tournament: "copa", year: 2015, finish: "winner" },
  "portugal-2016": { tournament: "euro", year: 2016, finish: "winner" },
  "france-2018": { tournament: "wc", year: 2018, finish: "winner" },
  "croatia-2018": { tournament: "wc", year: 2018, finish: "final" },
  "belgium-2018": { tournament: "wc", year: 2018, finish: "third" },
  // The era is labelled 2021 (when it was played); the tournament's name is Euro 2020.
  "england-2021": { tournament: "euro", year: 2020, finish: "final" },
  "argentina-2022": { tournament: "wc", year: 2022, finish: "winner" },
  "morocco-2022": { tournament: "wc", year: 2022, finish: "fourth" },
  "japan-2022": { tournament: "wc", year: 2022, finish: "r16" },
  "spain-2024": { tournament: "euro", year: 2024, finish: "winner" },
  // V1.8 — world coverage (engine v6 pool)
  "algeria-1982": { tournament: "wc", year: 1982, finish: "group" },
  "cameroon-2002": { tournament: "afcon", year: 2002, finish: "winner" },
  "ivory-coast-2006": { tournament: "wc", year: 2006, finish: "group" },
  "egypt-2008": { tournament: "afcon", year: 2008, finish: "winner" },
  "ghana-2010": { tournament: "wc", year: 2010, finish: "quarter" },
  "peru-1970": { tournament: "wc", year: 1970, finish: "quarter" },
  "mexico-1986": { tournament: "wc", year: 1986, finish: "quarter" },
  "usa-2002": { tournament: "wc", year: 2002, finish: "quarter" },
  "paraguay-2010": { tournament: "wc", year: 2010, finish: "quarter" },
  "costa-rica-2014": { tournament: "wc", year: 2014, finish: "quarter" },
  "colombia-2014": { tournament: "wc", year: 2014, finish: "quarter" },
  "mexico-2018": { tournament: "wc", year: 2018, finish: "r16" },
  "saudi-arabia-1994": { tournament: "wc", year: 1994, finish: "r16" },
  "iran-1998": { tournament: "wc", year: 1998, finish: "group" },
  "australia-2006": { tournament: "wc", year: 2006, finish: "r16" },
  "japan-2010": { tournament: "wc", year: 2010, finish: "r16" },
};

/** Ballon d'Or years for players in the dataset (no award in 2020). */
export const BALLON_DOR_YEARS: Record<string, number[]> = {
  "di-stefano": [1957, 1959], kopa: [1958], "luisito-suarez": [1960], law: [1964], eusebio: [1965], "bobby-charlton": [1966],
  best: [1968], rivera: [1969], "gerd-muller": [1970], cruyff: [1971, 1973, 1974], beckenbauer: [1972, 1976], blokhin: [1975],
  simonsen: [1977], keegan: [1978, 1979], rummenigge: [1980, 1981], "paolo-rossi": [1982], platini: [1983, 1984, 1985],
  belanov: [1986], gullit: [1987], "van-basten": [1988, 1989, 1992], matthaus: [1990], papin: [1991], "roberto-baggio": [1993],
  stoichkov: [1994], weah: [1995], sammer: [1996], ronaldo: [1997, 2002], zidane: [1998], rivaldo: [1999], figo: [2000],
  owen: [2001], nedved: [2003], shevchenko: [2004], ronaldinho: [2005], cannavaro: [2006], kaka: [2007],
  "cristiano-ronaldo": [2008, 2013, 2014, 2016, 2017], messi: [2009, 2010, 2011, 2012, 2015, 2019, 2021, 2023],
  modric: [2018], benzema: [2022], rodri: [2024], dembele: [2025],
};

/** A fact, ready for a localized template: `know.fact.<kind>` with params. */
export interface Fact {
  kind: "eraWorldCup" | "eraEuro" | "eraCopa" | "eraAfcon" | "eraOlympics" | "eraEuropeanCup" | "ballonDor";
  params: Record<string, string | number>;
  source: string;
}

export function eraFacts(clubEraId: string): Fact[] {
  const out: Fact[] = [];
  const r = NATION_ERA_RESULTS[clubEraId];
  if (r) {
    const kind = r.tournament === "wc" ? "eraWorldCup" : r.tournament === "euro" ? "eraEuro" : r.tournament === "afcon" ? "eraAfcon" : r.tournament === "olympics" ? "eraOlympics" : "eraCopa";
    out.push({ kind, params: { year: r.year, finish: r.finish }, source: r.tournament === "wc" ? (["winner", "final", "third", "fourth"].includes(r.finish) ? "wcTop4" : "wcRounds") : r.tournament === "euro" ? "euroFinals" : r.tournament === "afcon" ? "afcon" : r.tournament === "olympics" ? "olympics" : "copa" });
  }
  const era = getClubEra(clubEraId);
  if (era.europeanCups.length) out.push({ kind: "eraEuropeanCup", params: { years: era.europeanCups.join(", "), n: era.europeanCups.length }, source: "ucl" });
  return out;
}

export function playerFacts(playerEraId: string): Fact[] {
  const years = BALLON_DOR_YEARS[playerIdOf(playerEraId)];
  return years ? [{ kind: "ballonDor", params: { years: years.join(", "), n: years.length }, source: "ballonDor" }] : [];
}

/** Knowledge-catalog key + params for a fact (see src/knowledge/i18n). */
export function factMessage(f: Fact): { key: string; params: Record<string, string | number> } {
  switch (f.kind) {
    case "eraWorldCup":
      return { key: `fact.wc.${f.params.finish}`, params: f.params };
    case "eraEuro":
      return { key: `fact.euro.${f.params.finish}`, params: f.params };
    case "eraCopa":
      return { key: "fact.copa.winner", params: f.params };
    case "eraAfcon":
      return { key: "fact.afcon.winner", params: f.params };
    case "eraOlympics":
      return { key: "fact.olympics.winner", params: f.params };
    case "eraEuropeanCup":
      return { key: f.params.n === 1 ? "fact.europeanCup.one" : "fact.europeanCup.many", params: f.params };
    case "ballonDor":
      return { key: f.params.n === 1 ? "fact.ballonDor.one" : "fact.ballonDor.many", params: f.params };
  }
}
