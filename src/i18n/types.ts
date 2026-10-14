export type Lang = "fr" | "en" | "es";
export const LANGS: Lang[] = ["fr", "en", "es"];

/** A translatable message produced by the engine or the UI: a catalog key plus values. */
export interface Msg {
  key: string;
  params?: Record<string, string | number>;
}

export const msg = (key: string, params?: Record<string, string | number>): Msg => (params ? { key, params } : { key });
