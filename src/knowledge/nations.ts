import type { Lang } from "@/i18n";

/**
 * FIFA-style nation codes → localized names. Current countries go through the platform's
 * Intl.DisplayNames (correct spelling in every language, no hand translation); historical
 * teams and the UK home nations, which have no ISO region, use the i18n keys `nation.<CODE>`.
 */
export const ISO2: Record<string, string> = {
  FRA: "FR", ESP: "ES", ITA: "IT", POR: "PT", NED: "NL", BEL: "BE", BRA: "BR", ARG: "AR", URU: "UY", CHI: "CL", COL: "CO",
  PAR: "PY", PER: "PE", MEX: "MX", USA: "US", SEN: "SN", CIV: "CI", CMR: "CM", NGA: "NG", GHA: "GH", MAR: "MA", ALG: "DZ",
  EGY: "EG", TUN: "TN", MLI: "ML", GUI: "GN", JPN: "JP", KOR: "KR", AUS: "AU", SUI: "CH", AUT: "AT", DEN: "DK", SWE: "SE",
  NOR: "NO", FIN: "FI", ISL: "IS", POL: "PL", CZE: "CZ", SVK: "SK", HUN: "HU", ROU: "RO", BUL: "BG", GRE: "GR", TUR: "TR",
  CRO: "HR", SRB: "RS", BIH: "BA", SVN: "SI", MKD: "MK", MNE: "ME", ALB: "AL", UKR: "UA", RUS: "RU", GEO: "GE", ARM: "AM",
  ISR: "IL", IRN: "IR", CAN: "CA", JAM: "JM", TRI: "TT", CRC: "CR", HON: "HN", ECU: "EC", VEN: "VE", BOL: "BO", RSA: "ZA",
  ZAM: "ZM", CPV: "CV", GAB: "GA", TOG: "TG", BFA: "BF", COD: "CD", GER: "DE", IRL: "IE", BLR: "BY", MOZ: "MZ", KEN: "KE",
  SMR: "SM", LBR: "LR", ANG: "AO", CHN: "CN", KSA: "SA", QAT: "QA", NZL: "NZ", LUX: "LU", CYP: "CY", LTU: "LT", LVA: "LV",
  EST: "EE", KOS: "XK", ZIM: "ZW", SLV: "SV", PAN: "PA", GUA: "GT", CUB: "CU", HAI: "HT", DOM: "DO", SUR: "SR", CUW: "CW", GNB: "GW", BEN: "BJ", CHA: "TD",
};
/** Codes named through i18n (`nation.<CODE>`): no ISO region exists for them. */
export const HISTORICAL_NATIONS = ["ENG", "SCO", "WAL", "NIR", "URS", "YUG", "SCG", "TCH", "CIS", "GDR"] as const;

const cache = new Map<string, Intl.DisplayNames | null>();
function displayNames(lang: Lang): Intl.DisplayNames | null {
  if (!cache.has(lang)) {
    try {
      cache.set(lang, new Intl.DisplayNames([lang], { type: "region" }));
    } catch {
      cache.set(lang, null);
    }
  }
  return cache.get(lang) ?? null;
}

export function nationName(code: string, lang: Lang, t: (key: string) => string): string {
  if ((HISTORICAL_NATIONS as readonly string[]).includes(code)) return t(`nation.${code}`);
  const iso = ISO2[code];
  const name = iso ? displayNames(lang)?.of(iso) : undefined;
  return name && name !== iso ? name : code;
}
