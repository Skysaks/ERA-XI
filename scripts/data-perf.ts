/** Dataset cost: index build, lazy materialisation, lookups, knowledge derivations. */
const t0 = performance.now();
const data = await import("@/data");
const t1 = performance.now();
const { ALL_CLUB_ERAS, getPlayerEra, playerEraIdsOf, nationOf, ALL_PLAYER_IDS } = data;
let s = performance.now();
for (const e of ALL_CLUB_ERAS.slice(0, 12)) for (const id of e.playerEraIds) getPlayerEra(id);
const draftEras = performance.now() - s;
s = performance.now();
for (const e of ALL_CLUB_ERAS) for (const id of e.playerEraIds) getPlayerEra(id);
const all = performance.now() - s;
s = performance.now();
for (let k = 0; k < 10000; k++) playerEraIdsOf(ALL_PLAYER_IDS[k % ALL_PLAYER_IDS.length]!);
const versions = (performance.now() - s) / 10;
s = performance.now();
await data.loadNationality();
const natLoad = performance.now() - s;
s = performance.now();
nationOf("messi");
const natFirst = performance.now() - s;
s = performance.now();
const { roleSchool } = await import("@/knowledge/profile");
roleSchool();
const school = performance.now() - s;
console.log(`dataset module (eager index of ${ALL_CLUB_ERAS.length} eras): ${(t1 - t0).toFixed(1)} ms
materialise the eras of one draft (12): ${draftEras.toFixed(1)} ms
materialise everything (${ALL_CLUB_ERAS.reduce((a, e) => a + e.playerEraIds.length, 0).toLocaleString("en")} PlayerEras): ${all.toFixed(1)} ms
playerEraIdsOf ×1000: ${versions.toFixed(2)} ms
nationality chunk load: ${natLoad.toFixed(1)} ms · index parse (first call): ${natFirst.toFixed(1)} ms
Role School examples (scans all PlayerEras once): ${school.toFixed(1)} ms`);
