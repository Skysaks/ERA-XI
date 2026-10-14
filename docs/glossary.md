# ERA XI — football glossary (FR · EN · ES)

The reference for every UI string and Knowledge Layer text. Rules:

- **Never translate proper nouns**: player names, club names (Barcelona, AC Milan, Bayern Munich stay as written in `teams.ts`), competition names used as names (Copa América, Ballon d'Or / Ballon d'Or / Balón de Oro follows each language's usage).
- **No machine translation** of tactical terms: use the column below. When a language has no settled term, keep the international one (Box-to-box, Regista, Stopper).
- Nationality names come from the platform (`Intl.DisplayNames`), except historical teams and the UK home nations (`nation.<CODE>` keys: URS, YUG, SCG, TCH, CIS, GDR, ENG, SCO, WAL, NIR).
- ERA XI numbers are **model estimates**: "note ERA XI", "ERA XI rating", "valoración ERA XI" — never "stats".

## Roles (`role.<CODE>`)

| code | English | Français | Español |
|---|---|---|---|
| GK | Shot-stopper | Gardien sur sa ligne | Portero de línea |
| SK | Sweeper keeper | Gardien libéro | Portero líbero |
| BPD | Ball-playing CB | Central relanceur | Central con salida |
| STP | Stopper | Stoppeur | Stopper |
| FB | Overlapping full-back | Latéral offensif | Lateral ofensivo |
| DFB | Defensive full-back | Latéral défensif | Lateral defensivo |
| WB | Wing-back | Piston | Carrilero |
| ANC | Anchor (destroyer) | Sentinelle | Ancla |
| BW | Ball winner | Récupérateur | Recuperador |
| DLP | Deep playmaker | Meneur reculé | Organizador retrasado |
| B2B | Box-to-box | Box-to-box | Box-to-box |
| PM | Advanced playmaker | Meneur de jeu | Enganche |
| WNG | Wide winger | Ailier | Extremo |
| IF | Inside forward | Ailier intérieur | Extremo a pierna cambiada |
| TM | Target man | Point d'appui | Delantero de referencia |
| PCH | Poacher | Renard des surfaces | Cazagoles |
| F9 | False nine | Faux neuf | Falso nueve |
| CF | Complete forward | Attaquant complet | Delantero completo |
| PRS | Pressing forward | Attaquant de pressing | Delantero de presión |
| (school) | Regista | Regista | Regista |
| (school) | Inverted full-back | Latéral inversé | Lateral invertido |

## Attributes (`attr.<key>`)

| key | English | Français | Español |
|---|---|---|---|
| finishing | Finishing | Finition | Definición |
| creation | Creation | Création | Creación |
| progression | Progression | Progression | Progresión |
| retention | Control | Maîtrise | Control |
| defence | Defending | Défense | Defensa |
| pressing | Ball winning | Récupération | Recuperación |
| pace | Pace | Vitesse | Velocidad |
| physical | Physical | Physique | Físico |
| aerial | Aerial | Jeu aérien | Juego aéreo |
| buildUp | Build-up | Relance | Salida de balón |
| goalkeeping | Goalkeeping | Arrêts | Paradas |
| distribution | Distribution | Jeu au pied | Juego con el pie |

## Game terms

| English | Français | Español | note |
|---|---|---|---|
| FIT | FIT | FIT | never translated: the team-coherence score |
| out of position | hors poste | fuera de posición | |
| draft / draw | draft / tirage | draft / sorteo | "draft" is kept in FR and ES |
| era (team era) | époque | época | a squad in a period |
| Era Passport | Passeport des époques | Pasaporte de épocas | |
| Role School | École des rôles | Escuela de roles | |
| Perfect era (114/114) | Ère parfaite | Era perfecta | |
| World Cup | Coupe du monde | Mundial | |
| European Cup / Champions League | Coupe des clubs champions | Copa de Europa | pre-1992 and post-1992 finals are the same competition lineage |
| European Championship (Euro) | Euro | Eurocopa | |
| My Era | Mon Era | Mi Era | the personal hub; "Era" stays a name |
| Help / How to play | Aide / Comment jouer | Ayuda / Cómo se juega | |
| Rival / Rematch | Rival / Revanche | Rival / Revancha | |
| Activity | Activité | Actividad | |
| Today's XI (Daily XI) | XI du jour | XI del día | |
| Run it back | On la refait | Otra vez | same draw, new picks |
| line-up (the XI on the pitch) | compo | alineación | informal register in FR ("ta compo") |
| head coach | entraîneur | entrenador | era context |
| honours | palmarès | palmarés | era context: titles won inside the span |
| team sheet | ta compo | tu alineación | the XI screen |
| play the season | jouer la saison | jugar la temporada | never "simulate" in the UI |
| tactical identity / game plan | identité tactique / plan de jeu | identidad táctica / plan de juego | |
| in possession / without the ball | avec le ballon / sans le ballon | con balón / sin balón | |
| high press / mid-block / deep block | pressing haut / bloc médian / bloc bas | presión alta / bloque medio / bloque bajo | |
| overload (left/right side) | surnombre (à gauche / à droite) | superioridad (por la izquierda / derecha) | |
| centre-back pairing | charnière | pareja de centrales | "Elite defensive pair" → "Charnière d'élite" |
| control core | cœur du jeu | eje de control | screen + controller in midfield |
| key creator / balance player / main threat | créateur clé / joueur d'équilibre / menace n°1 | creador clave / jugador equilibrio / amenaza principal | |
| turning point | le tournant | el punto de inflexión | |
| points dropped | points perdus | puntos perdidos | a draw after a perfect start |
