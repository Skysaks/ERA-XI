import type { HelpCatalog } from "./types";

export const helpEn: HelpCatalog = {
  intro: "Short answers first. Tap MORE when you want the detail.",
  ui: { more: "More", less: "Less", school: "Open the Role School", allTopics: "All topics" },
  sections: [
    {
      id: "howto",
      title: "How to play",
      short:
        "Each round shows one club or national team in one era, and four of its players. Pick one. After 11 picks your XI plays a 38-match season against legendary sides: 3 points for a win, 114 is perfect.",
      more: [
        "Every pick joins your XI automatically in its best free position. Tap a player on the pitch to move or swap him.",
        "Once per draft you can reroll a round (↻) when nothing fits.",
        "Before kick-off you can change formation: the game points out a shape that clearly suits your XI better.",
        "After the season: challenge a friend on the same draw, run it back with new decisions, or analyse your XI.",
      ],
    },
    {
      id: "ratings",
      title: "Ratings & PlayerEras",
      short:
        "A PlayerEra is one player at one club in one period: Ronaldo at Manchester United 2003–2009 is not Ronaldo at Real Madrid. His rating is ERA XI's own estimate of his level there, not an official statistic.",
      more: [
        "The rating combines his level in that era with an attribute profile for his role: finishing, creation, defending, pace and so on.",
        "Tap i on a player: WHY 92? lists his elite, strong and limited attributes, his best role and his best positions.",
        "Player quality and team impact are different things. A 93 can make your XI worse if he duplicates a job or plays out of position.",
        "Ratings are model evaluations made for this game. They are open to debate, never historical truth.",
      ],
    },
    {
      id: "fit",
      title: "FIT & team balance",
      short:
        "FIT (0–100) measures how well your eleven play together: roles that complement each other, width, cover, build-up. A balanced XI of 86s often beats a pile of 94s.",
      more: [
        "FIT drops when players are out of position, when roles clash (two target men, three playmakers and no ball-winner) or when a line is missing a job.",
        "FIT rises with good partnerships: a ball-playing centre-back with a deep playmaker, a target man with crossers, inside forwards around a false nine.",
        "Tap FIT on the team sheet or in Analysis to see every point that moved it.",
        "During the season, FIT and the strength of each line decide how many games you win.",
      ],
    },
    {
      id: "positions",
      title: "Positions",
      short:
        "Every player has a natural position and sometimes secondary ones. Out of position he loses rating: a little in a neighbouring role (RB to RWB), a lot far from home (ST to CB).",
      more: [
        "Highlighted slot: natural position. Plain: secondary or close. Red ⚠: out of position.",
        "Tap a drafted player to see his rating at every slot before you move him.",
        "Two or more players out of position is the most common cause of a poor season.",
      ],
    },
    {
      id: "formations",
      title: "Formations",
      short:
        "Thirteen shapes, from 4-3-3 to 5-2-3. The formation decides which positions you need. You can change it before the season without losing anyone.",
      more: [
        "Wing-back systems need players who can cover the whole flank.",
        "Three centre-backs protect you, but take a man from midfield or attack.",
        "On the team sheet, FORMATION → names a clearly better shape when there is one.",
        "Every formation's strengths, needs and risks are one tap away in the formation list.",
      ],
    },
    {
      id: "modes",
      title: "Game modes",
      short:
        "Classic is the core game. Football IQ hides the ratings: you judge players by name, era and role. The other modes change the draw: one period, one club, one league, national teams, European champions and more.",
      more: [
        "Every mode lives under MODES → on Home, grouped by theme.",
        "Each week a theme changes the draw (the 2000s, Brazil, AC Milan…). The Daily XI follows it.",
        "Live Duel, Party Room and Shared Draft are real-time rooms with friends.",
      ],
    },
    {
      id: "daily",
      title: "Daily XI",
      short: "One draw per day, the same for everyone. Your first completed attempt is your official score; later attempts are practice.",
      more: [
        "A new Daily arrives at midnight UTC.",
        "During a themed week, the Daily follows the theme.",
        "Share your score: your friends play exactly the same draw.",
      ],
    },
    {
      id: "challenges",
      title: "Challenges & Duels",
      short:
        "After any season, CHALLENGE creates a link. Your friend drafts from the same eleven draws and you see who did better. No account needed.",
      more: [
        "The link carries the draw and your result, never personal data.",
        "Face the same person at least twice and they become a rival in MY ERA, with your head-to-head record and a REMATCH button.",
        "Live Duel: two players draft at the same time from the same offers. Season points decide; the head-to-head match breaks a tie.",
      ],
    },
    {
      id: "league",
      title: "Era League & 114 points",
      short:
        "Your XI plays 38 matches, home and away, against a league of legendary sides. A win is worth 3 points, a draw 1: 114 is a perfect season. Around 90 is very good; 100+ is rare.",
      more: [
        "The season is simulated from your attack, midfield, defence, goalkeeper and FIT, with a little match-day variance.",
        "113 is impossible: 37 wins and a draw make 112.",
        "A PERFECT ERA, 38 wins from 38, is possible but exceptional.",
      ],
    },
    {
      id: "roles",
      title: "Tactical roles",
      short:
        "Every player has a role: how he plays, not just where. A deep playmaker and a ball-winner are both midfielders but do different jobs, and FIT rewards XIs whose jobs complement each other.",
      more: [
        "The Role School explains each role: what it does, its strengths, what it needs around it, and examples from the game.",
        "The role shown on a player card is his best role in that era.",
      ],
    },
    {
      id: "glossary",
      title: "Glossary",
      short: "The words ERA XI uses, in one line each.",
      more: [],
    },
  ],
  glossary: [
    ["PlayerEra", "One player at one club (or national team) in one period."],
    ["Era", "A squad in a period: AC Milan 1987–1991, Brazil 1970."],
    ["Rating", "ERA XI's estimate of a PlayerEra's level, 0–99. A model, not a statistic."],
    ["FIT", "How well the eleven work together, 0–100."],
    ["ATT · MID · DEF · GK", "The strength of each line of your XI."],
    ["Out of position", "A player in a slot far from his natural position: he loses rating and FIT."],
    ["Role", "How a player plays: poacher, deep playmaker, wing-back…"],
    ["Reroll ↻", "Replace one round's offer, once per draft."],
    ["Daily XI", "Today's draw, the same for everyone. First attempt = official."],
    ["Run it back", "Same draw, new decisions. Practice, never official."],
    ["Era Passport", "Everything you have discovered: players, eras, clubs, nations."],
    ["Draft DNA", "Your drafting tendencies, measured once you have played enough."],
    ["Perfect Era", "38 wins from 38: 114 points."],
  ],
};
