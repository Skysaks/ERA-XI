/**
 * Engine version. Bump whenever data, draft generation, ratings or simulation
 * change in a way that alters outcomes for a given seed. Challenges carry it so
 * an old link is rejected cleanly instead of silently producing a different game.
 */
export const ENGINE_VERSION = "7";
export const PROTOCOL_VERSION = 1;
export const SEASON_MATCHES = 38;
export const MAX_POINTS = SEASON_MATCHES * 3; // 114
export const ROUNDS = 11;
export const OPTIONS_PER_ROUND = 4;
