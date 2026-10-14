"use client";

import { useMemo } from "react";
import { GameApp } from "@/components/GameApp";
import type { RoomPlatform } from "@/components/DuelApp";
import { CODE_RE, HttpTransport } from "@/multiplayer";

function resetUrl() {
  if (window.location.pathname !== "/" || window.location.search || window.location.hash) {
    window.history.replaceState(null, "", "/");
  }
}

function readLocationToken(): string | null {
  // Offline, the service worker serves the "/" shell for /c/<token>: read it from the path.
  const m = /^\/c\/([A-Za-z0-9_-]{20,600})\/?$/.exec(window.location.pathname);
  if (m) return m[1] ?? null;
  const q = new URLSearchParams(window.location.search).get("c");
  if (q) return q;
  const h = new URLSearchParams(window.location.hash.slice(1)).get("c");
  return h;
}

/** Web deployment: rooms live on the authoritative server behind /api/rooms. */
const serverRooms: RoomPlatform = {
  connect: async () => new HttpTransport("/api/rooms", 600),
  roomUrl: (code) => `${window.location.origin}/r/${code}`,
  setLocationRoom: (code) => {
    const path = code ? `/r/${code}` : "/";
    if (window.location.pathname !== path) window.history.replaceState(null, "", path);
  },
};

export function ClientGame({ token = null, room = null }: { token?: string | null; room?: string | null }) {
  const initialRoom = useMemo(() => {
    if (room && CODE_RE.test(room)) return room;
    // Same for /r/<code> served from the offline shell.
    const m = typeof window === "undefined" ? null : /^\/r\/([a-z2-9]{5})\/?$/.exec(window.location.pathname);
    return m?.[1] ?? null;
  }, [room]);
  return <GameApp initialToken={token} resetUrl={resetUrl} readLocationToken={readLocationToken} rooms={serverRooms} initialRoom={initialRoom} installable />;
}
