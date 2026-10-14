import type { OpponentTier } from "@/types";

/**
 * ERA LEAGUE — the 19 opponents of every season are drawn from these iconic sides.
 *
 * Data-driven and replaceable: the engine only reads id / tier / attack / defence;
 * `name` and `short` are display strings that can be renamed (e.g. for licensing)
 * without changing any result. attack/defence live on the same scale as team indices.
 */
export interface OpponentDef {
  id: string;
  name: string;
  /** Uppercase-friendly short form for the live fixture line. */
  short: string;
  tier: OpponentTier;
  attack: number;
  defence: number;
}

const o = (id: string, name: string, short: string, tier: OpponentTier, attack: number, defence: number): OpponentDef => ({
  id, name, short, tier, attack, defence,
});

export const OPPONENTS: OpponentDef[] = [
  // Giants
  o("barcelona-2011", "Barcelona 2011", "Barça 2011", "giant", 88, 85),
  o("milan-1989", "Milan 1989", "Milan 1989", "giant", 85, 88),
  o("real-madrid-2017", "Real Madrid 2017", "Real Madrid 2017", "giant", 87, 83),
  o("bayern-2013", "Bayern 2013", "Bayern 2013", "giant", 86, 86),
  o("brazil-1970", "Brazil 1970", "Brazil 1970", "giant", 89, 80),
  o("man-city-2023", "Man City 2023", "Man City 2023", "giant", 87, 85),
  o("liverpool-2019", "Liverpool 2019", "Liverpool 2019", "giant", 86, 85),
  o("real-madrid-1960", "Real Madrid 1960", "Real Madrid 1960", "giant", 88, 79),
  o("ajax-1972", "Ajax 1972", "Ajax 1972", "giant", 86, 83),
  o("spain-2010", "Spain 2010", "Spain 2010", "giant", 83, 88),
  // Elite
  o("man-united-1999", "Man United 1999", "Man Utd 1999", "elite", 84, 81),
  o("arsenal-2004", "Arsenal 2004", "Arsenal 2004", "elite", 84, 82),
  o("inter-2010", "Inter 2010", "Inter 2010", "elite", 80, 86),
  o("france-1998", "France 1998", "France 1998", "elite", 79, 87),
  o("brazil-2002", "Brazil 2002", "Brazil 2002", "elite", 85, 79),
  o("chelsea-2005", "Chelsea 2005", "Chelsea 2005", "elite", 80, 86),
  o("juventus-1996", "Juventus 1996", "Juventus 1996", "elite", 82, 83),
  o("liverpool-1984", "Liverpool 1984", "Liverpool 1984", "elite", 82, 83),
  o("bayern-1974", "Bayern 1974", "Bayern 1974", "elite", 84, 82),
  o("germany-2014", "Germany 2014", "Germany 2014", "elite", 84, 83),
  o("barcelona-1992", "Barcelona 1992", "Barça 1992", "elite", 84, 79),
  o("milan-2007", "Milan 2007", "Milan 2007", "elite", 82, 83),
  o("netherlands-1974", "Netherlands 1974", "Netherlands 1974", "elite", 85, 79),
  o("argentina-1986", "Argentina 1986", "Argentina 1986", "elite", 84, 80),
  // Strong
  o("dortmund-2013", "Dortmund 2013", "Dortmund 2013", "strong", 81, 77),
  o("atletico-2014", "Atlético 2014", "Atlético 2014", "strong", 76, 84),
  o("porto-2004", "Porto 2004", "Porto 2004", "strong", 77, 80),
  o("valencia-2001", "Valencia 2001", "Valencia 2001", "strong", 76, 81),
  o("marseille-1993", "Marseille 1993", "Marseille 1993", "strong", 80, 78),
  o("napoli-1990", "Napoli 1990", "Napoli 1990", "strong", 82, 75),
  o("lyon-2006", "Lyon 2006", "Lyon 2006", "strong", 79, 77),
  o("parma-1999", "Parma 1999", "Parma 1999", "strong", 78, 79),
  o("lazio-2000", "Lazio 2000", "Lazio 2000", "strong", 79, 79),
  o("monaco-2017", "Monaco 2017", "Monaco 2017", "strong", 81, 75),
  o("leverkusen-2024", "Leverkusen 2024", "Leverkusen 2024", "strong", 81, 78),
  o("benfica-1962", "Benfica 1962", "Benfica 1962", "strong", 81, 75),
  o("inter-1965", "Inter 1965", "Inter 1965", "strong", 75, 83),
  o("celtic-1967", "Celtic 1967", "Celtic 1967", "strong", 79, 76),
  // Dangerous
  o("leicester-2016", "Leicester 2016", "Leicester 2016", "dangerous", 76, 76),
  o("deportivo-2004", "Deportivo 2004", "Depor 2004", "dangerous", 77, 74),
  o("forest-1979", "Nottingham Forest 1979", "Forest 1979", "dangerous", 74, 78),
  o("red-star-1991", "Red Star 1991", "Red Star 1991", "dangerous", 78, 73),
  o("steaua-1986", "Steaua 1986", "Steaua 1986", "dangerous", 73, 78),
  o("psv-1988", "PSV 1988", "PSV 1988", "dangerous", 76, 75),
  o("blackburn-1995", "Blackburn 1995", "Blackburn 1995", "dangerous", 76, 73),
  o("newcastle-1996", "Newcastle 1996", "Newcastle 1996", "dangerous", 78, 71),
  o("kaiserslautern-1998", "Kaiserslautern 1998", "K'lautern 1998", "dangerous", 73, 74),
  o("montpellier-2012", "Montpellier 2012", "Montpellier 2012", "dangerous", 72, 73),
  o("greece-2004", "Greece 2004", "Greece 2004", "dangerous", 68, 80),
  o("leeds-2001", "Leeds 2001", "Leeds 2001", "dangerous", 75, 73),
  o("sampdoria-1991", "Sampdoria 1991", "Sampdoria 1991", "dangerous", 76, 74),
  o("wolfsburg-2009", "Wolfsburg 2009", "Wolfsburg 2009", "dangerous", 76, 71),
];

/** Each season: 19 opponents, stratified so every seed has comparable difficulty. */
export const LEAGUE_COMPOSITION: Record<OpponentTier, number> = {
  giant: 3,
  elite: 5,
  strong: 6,
  dangerous: 5,
};
