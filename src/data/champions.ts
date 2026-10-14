/**
 * European Cup / Champions League winners by final year (team ids from teams.ts).
 * An era "won" a final when the final's year falls inside its span [start, end].
 * Kept as a table instead of per-era tags so the Champions mode can't drift from history.
 */
export const EUROPEAN_CUP_WINNERS: Readonly<Record<number, string>> = {
  1956: "real-madrid", 1957: "real-madrid", 1958: "real-madrid", 1959: "real-madrid", 1960: "real-madrid",
  1961: "benfica", 1962: "benfica", 1963: "ac-milan", 1964: "inter", 1965: "inter",
  1966: "real-madrid", 1967: "celtic", 1968: "man-united", 1969: "ac-milan", 1970: "feyenoord",
  1971: "ajax", 1972: "ajax", 1973: "ajax", 1974: "bayern", 1975: "bayern",
  1976: "bayern", 1977: "liverpool", 1978: "liverpool", 1979: "forest", 1980: "forest",
  1981: "liverpool", 1982: "aston-villa", 1983: "hamburg", 1984: "liverpool", 1985: "juventus",
  1986: "steaua", 1987: "porto", 1988: "psv", 1989: "ac-milan", 1990: "ac-milan",
  1991: "red-star", 1992: "barcelona", 1993: "marseille", 1994: "ac-milan", 1995: "ajax",
  1996: "juventus", 1997: "dortmund", 1998: "real-madrid", 1999: "man-united", 2000: "real-madrid",
  2001: "bayern", 2002: "real-madrid", 2003: "ac-milan", 2004: "porto", 2005: "liverpool",
  2006: "barcelona", 2007: "ac-milan", 2008: "man-united", 2009: "barcelona", 2010: "inter",
  2011: "barcelona", 2012: "chelsea", 2013: "bayern", 2014: "real-madrid", 2015: "barcelona",
  2016: "real-madrid", 2017: "real-madrid", 2018: "real-madrid", 2019: "liverpool", 2020: "bayern",
  2021: "chelsea", 2022: "real-madrid", 2023: "man-city", 2024: "real-madrid", 2025: "psg",
};

export function europeanCupsOf(teamId: string, start: number, end: number): number[] {
  const out: number[] = [];
  for (let y = start; y <= end; y++) if (EUROPEAN_CUP_WINNERS[y] === teamId) out.push(y);
  return out;
}
