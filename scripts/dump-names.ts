import { RAW_ERAS } from "@/data/eras";
import { slugify } from "@/data";
const byId = new Map<string, { name: string; eras: string[] }>();
for (const e of RAW_ERAS) for (const row of e.players) {
  const p = row.split("|");
  const id = p[5] || slugify(p[0]!);
  const v = byId.get(id) ?? { name: p[0]!, eras: [] };
  v.eras.push(`${e.team} ${e.label}`);
  byId.set(id, v);
}
const lines = [...byId.entries()].sort().map(([id, v]) => `${v.name}${id !== slugify(v.name) ? ` [id: ${id}]` : ""} — ${v.eras.join("; ")}`);
console.log(lines.join("\n"));
const levels = RAW_ERAS.flatMap((e) => e.players.map((r) => Number(r.split("|")[2])));
const h: Record<number, number> = {};
for (const l of levels) h[Math.floor(l / 3) * 3] = (h[Math.floor(l / 3) * 3] ?? 0) + 1;
console.error("level histogram (3-pt bins):", JSON.stringify(h));
console.error("eras:", RAW_ERAS.map((e) => `${e.team} ${e.label}`).join(" | "));
