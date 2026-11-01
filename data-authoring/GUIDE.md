# ERA XI — dataset authoring guide (V1.3 expansion)

How historical squads ("eras") are added to the dataset. Each era is one team over a span of seasons:
13–18 players who were genuinely important in that squad at that time.

## Where to write
One batch file per expansion, e.g. `src/data/eras/more-1990s.ts` (starting from `export const ERAS: RawEra[] = [];`).
A batch touches only its own file. Team ids must come from `src/data/teams.ts`.

## Format
```ts
{
  team: "sevilla", label: "2005–2007", start: 2005, end: 2007, euro: [], // euro optional, see below
  players: [
    "Palop|GK|80|GK",
    "Dani Alves|RB RWB RM|87|FB|pac+4 cre+6",
    "Kanouté|ST|86|CF|aer+4",
  ],
},
```
- `label`: `"start–end"` with an EN DASH (–), or `"1970"` when start === end (tournaments for nations).
- Row = `"Name|POSITIONS|level|ROLE|overrides|id"`; overrides and id are optional. Trailing empty fields may be omitted.
  When you need an id without overrides write `"Name|POS|85|ROLE||the-id"` (empty 5th field).
- `Name`: how fans know him (surname, or the usual full form: "Roberto Carlos", "Dani Alves", "Rui Costa").
  Use the proper accents. If the SAME person already exists in `data-authoring/existing-players.txt`,
  reuse EXACTLY that spelling (so his eras link up). If a DIFFERENT person has the same spelling, give yours a
  unique id (e.g. `ronaldo-nazario` is NOT needed for Brazilian Ronaldo who already exists as "Ronaldo"; but a
  second "Rodri" or "Pepe" needs `|…|rodri-hernandez`).
- `POSITIONS`: space-separated, FIRST = natural position. Allowed: GK CB LB RB LWB RWB DM CM AM LM RM LW RW ST.
  Give 1–3 positions he really played.
- `level` (integer 68–98): his standing AT THAT CLUB DURING THAT SPAN, on the game's shared scale:
  - 96–98: all-time greats at their peak (Pelé, Maradona, Messi 2011, Cruyff 1972, Zidane 2002, R9 1997).
  - 92–95: world-class stars at peak (Henry 2004, Kaká 2007, Baggio 1994, Van Basten 1989, Rummenigge 1980).
  - 88–91: elite internationals, stars of a top side (Nedvěd 2003, Seedorf 2003, Pirlo 2007, Lampard 2005).
  - 84–87: very good starters of a top side / stars of a good side.
  - 79–83: solid starters, important squad players.
  - 72–78: squad/rotation players or starters of a modest side (use sparingly; still real contributors).
  Existing data averages ~86 for elite champion squads. Keep your ratings consistent with the anchors in
  `data-authoring/existing-players.txt` for players who already exist (same player, similar peak → similar level;
  earlier/later career → lower).
- `ROLE` (one of): GK (shot-stopper), SK (sweeper keeper), BPD (ball-playing CB), STP (stopper CB), FB (attacking full-back),
  DFB (defensive full-back), WB (wing-back), ANC (anchor DM), BW (ball-winner), DLP (deep playmaker), B2B (box-to-box),
  PM (advanced playmaker / no.10), WNG (winger), IF (inside forward), TM (target man), PCH (poacher), F9 (false nine),
  CF (complete forward), PRS (pressing forward). GK position ⇔ GK/SK role.
- `overrides` (optional, space-separated, each −14…+14): personal traits on top of the role template.
  Keys: fin (finishing) cre (creation) pro (progression/carrying) ret (retention) def (defending) pre (pressing)
  pac (pace) phy (physical) aer (aerial) bui (build-up) gk (goalkeeping) dis (distribution).
  Use for signature traits only (0–3 per player): a fast winger `pac+8`, a scoring midfielder `fin+8`,
  a tall striker `aer+8`, a slow creator `pac-6`.
- `euro` (clubs only): list the calendar year(s) of European Cup / Champions League FINALS this squad WON,
  within [start, end+1]. Omit when none. Be exact — this drives the "Champions" mode.

## Squad rules (validator enforces)
- 13–18 players, ≥1 GK (2 is nicer), ≥4 defenders, ≥3 midfielders, ≥2 attackers by natural position.
- No duplicate player inside an era. Players who played the whole span or a big part of it.
- An era should be a coherent, recognisable team (a title-winning or famous side), 2–6 seasons long.
- Do not duplicate an existing (team, label). Overlapping spans with an existing era of the same club are
  allowed only if the squad is meaningfully different (prefer non-overlapping).

## Validate (a batch is ready when this prints OK)
```
node scripts/run-ts.mjs scripts/validate-data.ts more-1990s
```
Namesake notes are informational: confirm each is the same person (keep) or add a unique id.
Accuracy beats volume: if unsure a player was in that squad, leave him out.
