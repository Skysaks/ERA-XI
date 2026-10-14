import { en, type Catalog, type MessageKey } from "./en";
import { LANGS, type Lang, type Msg } from "./types";

export { LANGS, en };
export type { Lang, Msg, MessageKey, Catalog };
export { msg } from "./types";

/**
 * English ships in the first-load bundle (it is also every fallback). French and Spanish are
 * their own chunks (~13.5 KB gz each): the app awaits the active one before its first paint,
 * so no one sees a flash of the wrong language, and English-only visitors never download them.
 */
export const CATALOGS: Partial<Record<Lang, Catalog>> = { en };
const loading: Partial<Record<Lang, Promise<void>>> = {};

export function hasCatalog(lang: Lang): boolean {
  return CATALOGS[lang] !== undefined;
}

export function loadCatalog(lang: Lang): Promise<void> {
  if (CATALOGS[lang]) return Promise.resolve();
  const p = (loading[lang] ??= (lang === "fr" ? import("./fr").then((m) => m.fr) : import("./es").then((m) => m.es)).then(
    (c) => {
      CATALOGS[lang] = c;
    },
    (e: unknown) => {
      delete loading[lang]; // retry on the next call (offline first visit, flaky network)
      throw e;
    },
  ));
  return p;
}

/** Tests, scripts and audits: every catalog in memory. */
export const loadAllCatalogs = () => Promise.all(LANGS.map(loadCatalog)).then(() => undefined);

export const LANG_LABEL: Record<Lang, string> = { fr: "FR", en: "EN", es: "ES" };
export const LANG_NAME: Record<Lang, string> = { fr: "Français", en: "English", es: "Español" };

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as string[]).includes(v);
}

/** Browser language → supported language (French, Spanish, else English). */
export function detectLang(nav: { language?: string; languages?: readonly string[] } | undefined): Lang {
  const list = [...(nav?.languages ?? []), nav?.language ?? ""];
  for (const l of list) {
    const base = l.toLowerCase().slice(0, 2);
    if (isLang(base)) return base;
  }
  return "en";
}

function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Plural category: French treats 0 and 1 as singular. */
function pluralOne(lang: Lang, n: number): boolean {
  return lang === "fr" ? Math.abs(n) < 2 : n === 1;
}

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const cat = (CATALOGS[lang] ?? en) as Record<string, string>;
  let k = key;
  if (!(k in cat) && params && typeof params.n === "number") {
    k = `${key}_${pluralOne(lang, params.n) ? "one" : "other"}`;
  }
  const s = cat[k] ?? (en as Record<string, string>)[k] ?? key;
  // Decimal comma in French and Spanish for pre-formatted numbers ("1.5" → "1,5").
  const local =
    params && lang !== "en"
      ? Object.fromEntries(Object.entries(params).map(([pk, v]) => [pk, typeof v === "string" && /^-?\d+\.\d+$/.test(v) ? v.replace(".", ",") : v]))
      : params;
  return interpolate(s, local);
}

export function formatMsg(lang: Lang, m: Msg): string {
  // Nested messages: a param whose value is itself a key reference "@key" is translated first.
  const params = m.params
    ? Object.fromEntries(
        Object.entries(m.params).map(([k, v]) => {
          if (typeof v !== "string" || !v.startsWith("@")) return [k, v];
          // "@key" → translated; "@key|lc" → translated, lower-cased (mid-sentence nouns).
          const [ref, mod] = v.slice(1).split("|");
          const out = translate(lang, ref ?? "");
          return [k, mod === "lc" ? out.toLocaleLowerCase(lang) : out];
        }),
      )
    : undefined;
  return translate(lang, m.key, params);
}

/** English rendering for engine-side strings (tests, logs, fallbacks). */
export const enText = (m: Msg) => formatMsg("en", m);

export interface Translator {
  lang: Lang;
  t: (key: MessageKey | (string & {}), params?: Record<string, string | number>) => string;
  m: (msg: Msg) => string;
}

export function translator(lang: Lang): Translator {
  return {
    lang,
    t: (key, params) => translate(lang, key, params),
    m: (msg) => formatMsg(lang, msg),
  };
}
