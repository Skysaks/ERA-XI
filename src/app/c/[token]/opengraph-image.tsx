import { ImageResponse } from "next/og";
import { decodeChallenge, FORMATIONS, MODES } from "@/engine";

export const alt = "ERA XI challenge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Link-preview image for challenge URLs. Shows the score and record only —
 * never the creator's picks (the challenger must not see them before playing).
 */
export default async function OG({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = decodeChallenge(token);
  const pts = d.ok ? d.challenge.creatorResult.points : null;
  const max = d.ok ? d.challenge.creatorResult.maxPoints : 114;
  const r = d.ok ? d.challenge.creatorResult : null;
  const who = d.ok ? (d.challenge.creatorName ?? "A friend").toUpperCase() : "";
  const meta = d.ok ? `${FORMATIONS[d.challenge.payload.f].label} · ${MODES[d.challenge.payload.m].label}` : "";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#080A09", color: "#F1EFE7", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 40, fontWeight: 800 }}>
          <div style={{ display: "flex" }}>
            ERA&nbsp;<span style={{ color: "#D9FF43" }}>XI</span>
          </div>
          <div style={{ fontSize: 28, color: "#777C78" }}>{meta}</div>
        </div>
        {pts !== null && r ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
            <div style={{ fontSize: 36, color: "#A3A79F" }}>{who} SCORED</div>
            <div style={{ display: "flex", alignItems: "baseline", fontWeight: 800 }}>
              <span style={{ fontSize: 220, lineHeight: 1 }}>{pts}</span>
              <span style={{ fontSize: 80, color: "#777C78" }}>&nbsp;/ {max}</span>
            </div>
            <div style={{ fontSize: 40, marginTop: 8 }}>{`${r.wins}W · ${r.draws}D · ${r.losses}L`}</div>
          </div>
        ) : (
          <div style={{ fontSize: 96, fontWeight: 800, marginTop: 80 }}>Build an impossible XI.</div>
        )}
        <div style={{ marginTop: "auto", fontSize: 48, fontWeight: 800, color: "#D9FF43" }}>SAME 11 DRAWS. BEAT THAT.</div>
      </div>
    ),
    size,
  );
}
