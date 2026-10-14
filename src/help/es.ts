import type { HelpCatalog } from "./types";

export const helpEs: HelpCatalog = {
  intro: "Primero la respuesta corta. Toca MÁS cuando quieras el detalle.",
  ui: { more: "Más", less: "Menos", school: "Abrir la Escuela de roles", allTopics: "Todos los temas" },
  sections: [
    {
      id: "howto",
      title: "Cómo se juega",
      short:
        "Cada ronda muestra un club o una selección en una época, y cuatro de sus jugadores. Elige uno. Tras 11 elecciones, tu XI juega una temporada de 38 partidos contra equipos legendarios: 3 puntos por victoria, 114 es la temporada perfecta.",
      more: [
        "Cada jugador elegido entra automáticamente en tu XI en su mejor puesto libre. Toca un jugador en el campo para moverlo o intercambiarlo.",
        "Una vez por draft puedes cambiar la oferta de una ronda (↻) cuando nada encaja.",
        "Antes del pitido inicial puedes cambiar el sistema: el juego señala el que le va claramente mejor a tu XI.",
        "Tras la temporada: reta a un amigo con el mismo sorteo, repítelo con otras decisiones o analiza tu XI.",
      ],
    },
    {
      id: "ratings",
      title: "Valoraciones y PlayerEra",
      short:
        "Una PlayerEra es un jugador en un club en un periodo: Ronaldo en el Manchester United 2003–2009 no es Ronaldo en el Real Madrid. Su valoración es la estimación propia de ERA XI de su nivel en ese momento, no una estadística oficial.",
      more: [
        "La valoración combina su nivel en esa época con un perfil de atributos según su rol: definición, creación, defensa, velocidad…",
        "Toca i en un jugador: ¿POR QUÉ 92? muestra sus atributos de élite, fuertes y limitados, su mejor rol y sus mejores puestos.",
        "La calidad del jugador y su impacto en el equipo son cosas distintas. Un 93 puede empeorar tu XI si repite función o juega fuera de posición.",
        "Las valoraciones son evaluaciones del modelo de ERA XI. Se pueden discutir; nunca son verdad histórica.",
      ],
    },
    {
      id: "fit",
      title: "FIT y equilibrio",
      short:
        "El FIT (0–100) mide si tus once juegan juntos: roles que se complementan, amplitud, coberturas, salida de balón. Un XI equilibrado de 86 suele ganar a un montón de 94.",
      more: [
        "El FIT baja con jugadores fuera de posición, con roles que chocan (dos delanteros de referencia, tres organizadores y ningún recuperador) o cuando a una línea le falta una función.",
        "Sube con buenas sociedades: un central con salida y un organizador retrasado, un delantero de referencia con centradores, extremos a pierna cambiada alrededor de un falso nueve.",
        "Toca FIT en la alineación o en el análisis para ver cada punto que lo movió.",
        "Durante la temporada, el FIT y la fuerza de cada línea deciden cuántos partidos ganas.",
      ],
    },
    {
      id: "positions",
      title: "Posiciones",
      short:
        "Cada jugador tiene una posición natural y a veces secundarias. Fuera de posición pierde valoración: poco en un puesto vecino (lateral derecho a carrilero), mucho lejos de su sitio (delantero centro a central).",
      more: [
        "Casilla resaltada: posición natural. Neutra: secundaria o cercana. Roja ⚠: fuera de posición.",
        "Toca un jugador de tu XI para ver su valoración en cada puesto antes de moverlo.",
        "Dos o más jugadores fuera de posición: es la causa más frecuente de una mala temporada.",
      ],
    },
    {
      id: "formations",
      title: "Sistemas",
      short:
        "Trece sistemas, del 4-3-3 al 5-2-3. El sistema decide qué posiciones necesitas. Puedes cambiarlo antes de la temporada sin perder a nadie.",
      more: [
        "Los sistemas con carrileros necesitan jugadores capaces de cubrir toda la banda.",
        "Tres centrales te protegen, pero le quitan un hombre al medio o al ataque.",
        "En la alineación, FORMACIÓN → indica un sistema claramente mejor cuando lo hay.",
        "Fortalezas, necesidades y riesgos de cada sistema están a un toque en la lista de sistemas.",
      ],
    },
    {
      id: "modes",
      title: "Modos de juego",
      short:
        "El Clásico es el corazón del juego. Fútbol IQ oculta las valoraciones: juzgas a los jugadores por nombre, época y rol. Los demás modos cambian el sorteo: un periodo, un club, una liga, selecciones, campeones de Europa y más.",
      more: [
        "Todos los modos están en MODOS → en el inicio, agrupados por tema.",
        "Cada semana un tema cambia el sorteo (los 2000, Brasil, el AC Milan…). El XI del día lo sigue.",
        "Duelo en directo, Sala de grupo y Draft compartido se juegan en tiempo real con amigos.",
      ],
    },
    {
      id: "daily",
      title: "XI del día",
      short: "Un sorteo al día, el mismo para todos. Tu primer intento terminado es tu puntuación oficial; los siguientes son práctica.",
      more: [
        "Un nuevo XI del día llega a medianoche UTC.",
        "Durante una semana temática, el XI del día sigue el tema.",
        "Comparte tu puntuación: tus amigos juegan exactamente el mismo sorteo.",
      ],
    },
    {
      id: "challenges",
      title: "Retos y duelos",
      short:
        "Tras cada temporada, RETAR crea un enlace. Tu amigo hace el draft con los mismos once sorteos y comparáis. Sin cuenta.",
      more: [
        "El enlace lleva el sorteo y tu resultado, nunca datos personales.",
        "Enfréntate a la misma persona al menos dos veces y se convierte en rival en MI ERA, con vuestro historial y un botón REVANCHA.",
        "Duelo en directo: dos jugadores hacen el draft a la vez con las mismas ofertas. Deciden los puntos de la temporada; el cara a cara deshace el empate.",
      ],
    },
    {
      id: "league",
      title: "Era League y 114 puntos",
      short:
        "Tu XI juega 38 partidos, ida y vuelta, en una liga de equipos legendarios. Victoria 3 puntos, empate 1: 114 es la temporada perfecta. Alrededor de 90 es muy bueno; 100 o más es raro.",
      more: [
        "La temporada se simula a partir de tu ataque, medio, defensa, portero y FIT, con algo de azar de un partido a otro.",
        "113 es imposible: 37 victorias y un empate suman 112.",
        "Una ERA PERFECTA, 38 victorias de 38, es posible pero excepcional.",
      ],
    },
    {
      id: "roles",
      title: "Roles tácticos",
      short:
        "Cada jugador tiene un rol: cómo juega, no solo dónde. Un organizador retrasado y un recuperador son centrocampistas, pero hacen trabajos distintos, y el FIT premia los XI cuyas funciones se complementan.",
      more: [
        "La Escuela de roles explica cada rol: qué hace, sus fortalezas, qué necesita a su alrededor y ejemplos del juego.",
        "El rol que aparece en la ficha de un jugador es su mejor rol en esa época.",
      ],
    },
    {
      id: "glossary",
      title: "Glosario",
      short: "Las palabras de ERA XI, en una línea cada una.",
      more: [],
    },
  ],
  glossary: [
    ["PlayerEra", "Un jugador en un club (o una selección) en un periodo."],
    ["Época", "Una plantilla en un periodo: AC Milan 1987–1991, Brasil 1970."],
    ["Valoración", "La estimación de ERA XI del nivel de una PlayerEra, de 0 a 99. Un modelo, no una estadística."],
    ["FIT", "Lo bien que funcionan juntos los once, de 0 a 100."],
    ["ATA · MED · DEF · POR", "La fuerza de cada línea de tu XI."],
    ["Fuera de posición", "Un jugador lejos de su posición natural: pierde valoración y FIT."],
    ["Rol", "Cómo juega: cazagoles, organizador retrasado, carrilero…"],
    ["Cambio ↻", "Sustituye la oferta de una ronda, una vez por draft."],
    ["XI del día", "El sorteo del día, igual para todos. Primer intento = oficial."],
    ["Otra vez", "Mismo sorteo, nuevas decisiones. Práctica, nunca oficial."],
    ["Pasaporte de épocas", "Todo lo que has descubierto: jugadores, épocas, clubes, selecciones."],
    ["ADN de draft", "Tus tendencias de draft, medidas cuando has jugado lo suficiente."],
    ["Era perfecta", "38 victorias de 38: 114 puntos."],
  ],
};
