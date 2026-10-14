/**
 * Single-file build entry (no server): same engine and components as the Next app.
 * Challenge links use a bare hash token (#<token>) instead of the /c/[token] route.
 * Live rooms use the host page's presence channel when it offers one (claude.ai artifact
 * `room` capability) with commit–reveal; otherwise they fall back to practice vs the bot.
 */
import { createRoot } from "react-dom/client";
import { GameApp } from "@/components/GameApp";
import type { RoomPlatform } from "@/components/DuelApp";
import { PresenceTransport, type PresenceChannel, type RoomTransport } from "@/multiplayer";

const TOKEN_RE = /^[A-Za-z0-9_-]{40,600}$/;
const ROOM_RE = /^r-([a-z2-9]{5})$/;

function base() {
  return window.location.href.split("#")[0] ?? window.location.href;
}

function setHash(h: string | null) {
  try {
    window.history.replaceState(null, "", h ? `${base()}#${h}` : base());
  } catch {
    /* sandboxed frames may refuse history writes */
  }
}

type ClaudeRuntime = { use(name: string): Promise<unknown> };

let transport: Promise<RoomTransport | null> | null = null;

function connectPresence(): Promise<RoomTransport | null> {
  transport ??= (async () => {
    const claude = (window as unknown as { claude?: ClaudeRuntime }).claude;
    if (!claude?.use) return null;
    try {
      const room = (await claude.use("room")) as PresenceChannel | null;
      if (!room) return null;
      // Per-tab (sessionStorage): a reload re-joins the same seat, a second tab is a second player.
      const store = {
        get: (k: string) => {
          try {
            return window.sessionStorage.getItem(k);
          } catch {
            return null;
          }
        },
        set: (k: string, v: string) => {
          try {
            window.sessionStorage.setItem(k, v);
          } catch {
            /* ignore */
          }
        },
      };
      return new PresenceTransport(room, store);
    } catch {
      return null;
    }
  })();
  return transport;
}

const presenceRooms: RoomPlatform = {
  connect: connectPresence,
  roomUrl: (code) => `${base()}#r-${code}`,
  setLocationRoom: (code) => setHash(code ? `r-${code}` : null),
};

const root = document.getElementById("era-xi-root");
if (root) {
  const hash = window.location.hash.slice(1);
  const room = ROOM_RE.exec(hash)?.[1] ?? null;
  createRoot(root).render(
    <GameApp
      buildChallengeUrl={(token) => `${base()}#${token}`}
      readLocationToken={() => {
        const h = window.location.hash.slice(1);
        return TOKEN_RE.test(h) ? h : null;
      }}
      resetUrl={() => {
        if (window.location.hash) setHash(null);
      }}
      imageSharing={false}
      rooms={presenceRooms}
      initialRoom={room}
    />,
  );
}
