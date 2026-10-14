import type { CreateRoomRequest, JoinRequest } from "./protocol";
import type { Intent, Result, RoomSnapshot } from "./types";

/**
 * The only thing the client knows about the network. Game logic (engine), room rules
 * (roomEngine) and UI never touch sockets or fetch directly — swapping HTTP polling for
 * WebSockets, a realtime service or a peer-to-peer channel is one new implementation.
 */
export type TransportStatus = "online" | "reconnecting" | "offline";

export interface RoomListener {
  onSnapshot(snapshot: RoomSnapshot): void;
  onStatus?(status: TransportStatus): void;
  onError?(error: { code: string; message: string }): void;
  /** Diagnostics: consecutive failed attempts since the last good snapshot (0 = healthy). */
  onAttempt?(failures: number): void;
}

export interface RoomTransport {
  readonly kind: "memory" | "http" | "presence";
  create(req: CreateRoomRequest): Promise<Result<RoomSnapshot>>;
  join(code: string, req: JoinRequest): Promise<Result<RoomSnapshot>>;
  send(code: string, token: string, intent: Intent): Promise<Result<RoomSnapshot>>;
  /** Keep a snapshot stream alive (also acts as the heartbeat). Returns an unsubscribe. */
  watch(code: string, token: string, listener: RoomListener): () => void;
}
