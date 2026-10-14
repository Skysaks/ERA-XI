import type { HelpCatalog } from "./types";

export const helpFr: HelpCatalog = {
  intro: "D'abord la réponse courte. Touche PLUS pour le détail.",
  ui: { more: "Plus", less: "Moins", school: "Ouvrir l'École des rôles", allTopics: "Tous les sujets" },
  sections: [
    {
      id: "howto",
      title: "Comment jouer",
      short:
        "Chaque tour propose un club ou une sélection à une époque, et quatre de ses joueurs. Tu en choisis un. Après 11 choix, ton XI dispute une saison de 38 matchs contre des équipes légendaires : 3 points la victoire, 114 est la saison parfaite.",
      more: [
        "Chaque joueur choisi rejoint automatiquement ton XI au meilleur poste libre. Touche un joueur sur le terrain pour le déplacer ou l'échanger.",
        "Une fois par draft, tu peux relancer un tour (↻) quand rien ne convient.",
        "Avant le coup d'envoi, tu peux changer de système : le jeu signale celui qui convient nettement mieux à ton XI.",
        "Après la saison : défie un ami sur le même tirage, rejoue-le avec d'autres choix, ou analyse ton XI.",
      ],
    },
    {
      id: "ratings",
      title: "Notes et PlayerEra",
      short:
        "Une PlayerEra, c'est un joueur dans un club à une période : Ronaldo à Manchester United 2003–2009 n'est pas Ronaldo au Real Madrid. Sa note est l'estimation propre à ERA XI de son niveau à ce moment-là, pas une statistique officielle.",
      more: [
        "La note combine son niveau à cette époque et un profil d'attributs lié à son rôle : finition, création, défense, vitesse…",
        "Touche i sur un joueur : POURQUOI 92 ? liste ses points élite, forts et limités, son meilleur rôle et ses meilleurs postes.",
        "Qualité du joueur et impact sur l'équipe sont deux choses différentes. Un 93 peut affaiblir ton XI s'il fait doublon ou joue hors poste.",
        "Les notes sont des évaluations du modèle ERA XI. Elles se discutent ; ce ne sont jamais des vérités historiques.",
      ],
    },
    {
      id: "fit",
      title: "FIT et équilibre",
      short:
        "Le FIT (0–100) mesure si tes onze jouent ensemble : des rôles qui se complètent, de la largeur, de la couverture, une relance. Un XI équilibré de 86 bat souvent une accumulation de 94.",
      more: [
        "Le FIT baisse quand des joueurs sont hors poste, quand des rôles se marchent dessus (deux points d'appui, trois meneurs et aucun récupérateur) ou quand il manque une tâche dans une ligne.",
        "Il monte avec les bonnes associations : un central relanceur avec un meneur reculé, un point d'appui avec des centreurs, des ailiers intérieurs autour d'un faux neuf.",
        "Touche FIT sur ta compo ou dans l'analyse pour voir chaque point qui l'a fait bouger.",
        "Pendant la saison, le FIT et la force de chaque ligne décident du nombre de victoires.",
      ],
    },
    {
      id: "positions",
      title: "Postes",
      short:
        "Chaque joueur a un poste naturel, parfois des postes secondaires. Hors poste, il perd des points : un peu dans un rôle voisin (latéral droit en piston droit), beaucoup loin de chez lui (avant-centre en défense centrale).",
      more: [
        "Case en surbrillance : poste naturel. Case neutre : secondaire ou proche. Rouge ⚠ : hors poste.",
        "Touche un joueur de ton XI pour voir sa note à chaque poste avant de le déplacer.",
        "Deux joueurs hors poste ou plus : c'est la cause la plus fréquente d'une mauvaise saison.",
      ],
    },
    {
      id: "formations",
      title: "Systèmes",
      short:
        "Treize systèmes, du 4-3-3 au 5-2-3. Le système décide des postes dont tu as besoin. Tu peux en changer avant la saison sans perdre personne.",
      more: [
        "Les systèmes à pistons demandent des joueurs capables de couvrir tout le couloir.",
        "Trois centraux te protègent, mais coûtent un joueur au milieu ou en attaque.",
        "Sur ta compo, FORMATION → indique un système nettement meilleur quand il y en a un.",
        "Points forts, besoins et risques de chaque système sont à un geste dans la liste des systèmes.",
      ],
    },
    {
      id: "modes",
      title: "Modes de jeu",
      short:
        "Le Classique est le cœur du jeu. Le QI Foot cache les notes : tu juges les joueurs au nom, à l'époque et au rôle. Les autres modes changent le tirage : une période, un club, un championnat, les sélections, les champions d'Europe, et plus encore.",
      more: [
        "Tous les modes sont dans MODES → sur l'accueil, classés par thème.",
        "Chaque semaine, un thème change le tirage (les années 2000, le Brésil, l'AC Milan…). L'XI du jour le suit.",
        "Duel en direct, Salon et Draft partagé se jouent en temps réel avec des amis.",
      ],
    },
    {
      id: "daily",
      title: "XI du jour",
      short: "Un tirage par jour, le même pour tout le monde. Ta première tentative terminée est ton score officiel ; les suivantes sont de l'entraînement.",
      more: [
        "Un nouvel XI du jour arrive à minuit UTC.",
        "Pendant une semaine à thème, l'XI du jour suit le thème.",
        "Partage ton score : tes amis jouent exactement le même tirage.",
      ],
    },
    {
      id: "challenges",
      title: "Défis et duels",
      short:
        "Après chaque saison, DÉFIER crée un lien. Ton ami drafte sur les mêmes onze tirages et vous comparez. Aucun compte nécessaire.",
      more: [
        "Le lien contient le tirage et ton résultat, jamais de données personnelles.",
        "Affronte la même personne au moins deux fois et elle devient un rival dans MON ERA, avec votre bilan et un bouton REVANCHE.",
        "Duel en direct : deux joueurs draftent en même temps sur les mêmes offres. Les points de la saison décident ; le face-à-face départage une égalité.",
      ],
    },
    {
      id: "league",
      title: "Era League et 114 points",
      short:
        "Ton XI dispute 38 matchs, aller et retour, dans un championnat d'équipes légendaires. Victoire 3 points, nul 1 point : 114, c'est la saison parfaite. Autour de 90, c'est très bien ; 100 et plus, c'est rare.",
      more: [
        "La saison est simulée à partir de ton attaque, ton milieu, ta défense, ton gardien et ton FIT, avec un peu d'aléa d'un match à l'autre.",
        "113 est impossible : 37 victoires et un nul font 112.",
        "Une ÈRE PARFAITE, 38 victoires sur 38, est possible mais exceptionnelle.",
      ],
    },
    {
      id: "roles",
      title: "Rôles tactiques",
      short:
        "Chaque joueur a un rôle : sa manière de jouer, pas seulement sa place. Un meneur reculé et un récupérateur sont tous deux milieux, mais ne font pas le même travail, et le FIT récompense les XI dont les tâches se complètent.",
      more: [
        "L'École des rôles explique chaque rôle : ce qu'il fait, ses forces, ce dont il a besoin autour de lui, et des exemples tirés du jeu.",
        "Le rôle affiché sur la fiche d'un joueur est son meilleur rôle à cette époque.",
      ],
    },
    {
      id: "glossary",
      title: "Glossaire",
      short: "Les mots d'ERA XI, en une ligne chacun.",
      more: [],
    },
  ],
  glossary: [
    ["PlayerEra", "Un joueur dans un club (ou une sélection) à une période."],
    ["Époque", "Un effectif à une période : AC Milan 1987–1991, Brésil 1970."],
    ["Note", "L'estimation ERA XI du niveau d'une PlayerEra, de 0 à 99. Un modèle, pas une statistique."],
    ["FIT", "La cohérence des onze, de 0 à 100."],
    ["ATT · MIL · DÉF · GB", "La force de chaque ligne de ton XI."],
    ["Hors poste", "Un joueur placé loin de son poste naturel : il perd des points et du FIT."],
    ["Rôle", "Sa manière de jouer : renard des surfaces, meneur reculé, piston…"],
    ["Relance ↻", "Remplace l'offre d'un tour, une fois par draft."],
    ["XI du jour", "Le tirage du jour, le même pour tous. Première tentative = officielle."],
    ["On la refait", "Même tirage, nouveaux choix. De l'entraînement, jamais officiel."],
    ["Passeport des époques", "Tout ce que tu as découvert : joueurs, époques, clubs, nations."],
    ["ADN de draft", "Tes tendances de draft, mesurées quand tu as assez joué."],
    ["Ère parfaite", "38 victoires sur 38 : 114 points."],
  ],
};
