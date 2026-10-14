"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Formation, PlayerEra } from "@/types";
import { assessSlot } from "@/engine";
import { useI18n } from "@/i18n/react";

export type PitchVariant = "draft" | "full" | "mini";

interface PitchProps {
  formation: Formation;
  players: readonly (PlayerEra | null)[];
  variant: PitchVariant;
  showRatings: boolean;
  /** Slot that just received a player (pop + ring). */
  freshSlot?: number | null;
  freshKey?: number;
  /** Slot where the hovered option would land. */
  previewSlot?: number | null;
  selectedSlot?: number | null;
  /** While a player is selected: his rating at every other slot (tap one to move him there). */
  destinations?: Record<number, { rating: number; oop: boolean }> | null;
  onSlotClick?: (index: number) => void;
  /** A tactical moment: these slots glow once (a completed line, a new connection). */
  highlight?: { slots: number[]; key: number } | null;
  /** Tactical connections drawn as faint lines between the players involved. */
  links?: number[][] | null;
  className?: string;
  style?: CSSProperties;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Pitch markings drawn in pixel space so circles stay circles at any aspect. */
function PitchLines({ w, h }: { w: number; h: number }) {
  if (!w || !h) return null;
  const m = Math.max(6, Math.min(w, h) * 0.035);
  const iw = w - 2 * m;
  const ih = h - 2 * m;
  const r = Math.min(iw * 0.14, ih * 0.16);
  const boxW = iw * 0.58;
  const boxH = Math.min(ih * 0.16, iw * 0.3);
  const sixW = iw * 0.28;
  const sixH = boxH * 0.38;
  const cx = w / 2;
  const stroke = "rgb(241 239 231 / 0.16)";
  const arcR = r * 0.95;
  const spotOffset = boxH * 0.72;
  // Penalty arc: part of circle around the spot that lies outside the box.
  const arc = (spotY: number, dir: 1 | -1) => {
    const edge = dir === 1 ? m + ih - boxH : m + boxH;
    const dy = Math.abs(edge - spotY);
    if (dy >= arcR) return null;
    const dx = Math.sqrt(arcR * arcR - dy * dy);
    const sweep = dir === 1 ? 1 : 0;
    return <path d={`M ${cx - dx} ${edge} A ${arcR} ${arcR} 0 0 ${sweep} ${cx + dx} ${edge}`} fill="none" stroke={stroke} strokeWidth={1.25} />;
  };
  const ownSpot = m + ih - spotOffset;
  const oppSpot = m + spotOffset;
  return (
    <svg className="absolute inset-0 h-full w-full" width={w} height={h} aria-hidden>
      <rect x={m} y={m} width={iw} height={ih} fill="none" stroke={stroke} strokeWidth={1.25} rx={2} />
      <line x1={m} y1={h / 2} x2={w - m} y2={h / 2} stroke={stroke} strokeWidth={1.25} />
      <circle cx={cx} cy={h / 2} r={r} fill="none" stroke={stroke} strokeWidth={1.25} />
      <circle cx={cx} cy={h / 2} r={2} fill={stroke} />
      {/* own half (bottom) */}
      <rect x={cx - boxW / 2} y={m + ih - boxH} width={boxW} height={boxH} fill="none" stroke={stroke} strokeWidth={1.25} />
      <rect x={cx - sixW / 2} y={m + ih - sixH} width={sixW} height={sixH} fill="none" stroke={stroke} strokeWidth={1.25} />
      <circle cx={cx} cy={ownSpot} r={1.8} fill={stroke} />
      {arc(ownSpot, 1)}
      {/* opposition half (top) */}
      <rect x={cx - boxW / 2} y={m} width={boxW} height={boxH} fill="none" stroke={stroke} strokeWidth={1.25} />
      <rect x={cx - sixW / 2} y={m} width={sixW} height={sixH} fill="none" stroke={stroke} strokeWidth={1.25} />
      <circle cx={cx} cy={oppSpot} r={1.8} fill={stroke} />
      {arc(oppSpot, -1)}
    </svg>
  );
}

const SIZES: Record<PitchVariant, { dot: string; num: string; name: string; maxName: string }> = {
  draft: { dot: "size-8", num: "text-[15px]", name: "text-[11px]", maxName: "max-w-[82px]" },
  full: { dot: "size-10 sm:size-11", num: "text-[18px]", name: "text-[11.5px] sm:text-[12.5px]", maxName: "max-w-[96px]" },
  mini: { dot: "size-6", num: "text-[11px]", name: "text-[11px]", maxName: "max-w-[60px]" },
};

export function Pitch({
  formation,
  players,
  variant,
  showRatings,
  freshSlot,
  freshKey,
  previewSlot,
  selectedSlot,
  destinations = null,
  onSlotClick,
  highlight = null,
  links = null,
  className = "",
  style,
}: PitchProps) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const sz = SIZES[variant];
  const { t } = useI18n();
  const interactive = Boolean(onSlotClick);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-[14px] bg-pitch ${className}`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(180deg, rgb(255 255 255 / 0.018) 0 11%, transparent 11% 22%)",
        ...style,
      }}
    >
      <PitchLines w={w} h={h} />
      {links && links.length > 0 && (
        // Positional relationships: who plays off whom. Hairlines, under the players.
        <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {links.flatMap((group, g) =>
            group.slice(1).map((to, k) => {
              const a = formation.slots[group[k]!];
              const b = formation.slots[to];
              if (!a || !b) return null;
              return (
                <line
                  key={`${g}-${k}`}
                  x1={a.x * 0.86 + 7}
                  y1={100 - (a.y * 0.84 + 8)}
                  x2={b.x * 0.86 + 7}
                  y2={100 - (b.y * 0.84 + 8)}
                  stroke="rgb(217 255 67 / 0.5)"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              );
            }),
          )}
        </svg>
      )}
      {formation.slots.map((slot, i) => {
        const p = players[i] ?? null;
        const left = `${slot.x * 0.86 + 7}%`;
        const top = `${100 - (slot.y * 0.84 + 8)}%`;
        const a = p ? assessSlot(p, slot.position) : null;
        const oop = a?.outOfPosition ?? false;
        const isFresh = freshSlot === i;
        const lit = highlight?.slots.includes(i) ?? false;
        const isPreview = previewSlot === i;
        const isSelected = selectedSlot === i;
        const dest = destinations?.[i];
        const pos = t(`pos.${slot.position}`);
        const label = p ? (showRatings ? String(p.overall) : pos) : pos;
        const Tag = interactive ? "button" : "div";
        return (
          <Tag
            key={`${slot.id}-${isFresh ? freshKey : ""}-${lit ? highlight?.key : ""}`}
            data-slot={i}
            type={interactive ? "button" : undefined}
            onClick={interactive ? () => onSlotClick?.(i) : undefined}
            aria-label={
              dest
                ? t("move.aria", { pos, rating: dest.rating })
                : p
                  ? `${p.name}, ${pos}${oop ? `, ${t("draft.oop")}` : ""}`
                  : pos
            }
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-[left,top] duration-200 ease-out ${
              interactive ? "p-1.5 -m-1.5" : ""
            }`}
            style={{ left, top }}
          >
            {dest && (
              <span
                className={`pointer-events-none absolute -top-3.5 z-10 whitespace-nowrap rounded-[5px] px-1 py-[1px] font-display text-[12px] font-bold leading-none tnum shadow ${
                  dest.oop ? "bg-loss text-ink" : "bg-volt text-ink"
                }`}
              >
                {pos} {dest.rating}
                {dest.oop && <span aria-hidden> ⚠</span>}
              </span>
            )}
            <span
              className={[
                "relative grid place-items-center rounded-full font-display font-bold leading-none tnum transition-[background-color,box-shadow] duration-150",
                sz.dot,
                sz.num,
                p
                  ? "bg-chalk text-ink"
                  : isPreview
                    ? "border-[1.5px] border-dashed border-volt text-volt"
                    : "border border-dashed border-chalk/25 text-chalk/35",
                p && !showRatings ? "text-[11px]" : "",
                oop ? "ring-2 ring-loss ring-offset-2 ring-offset-pitch" : "",
                isSelected ? "ring-2 ring-volt ring-offset-2 ring-offset-pitch" : "",
                dest && !p ? "border-solid border-volt/70 text-volt" : "",
                isFresh ? "animate-[pop_300ms_150ms_cubic-bezier(0.2,0.9,0.25,1.2)_both]" : "",
              ].join(" ")}
            >
              {isFresh && <span className="absolute inset-0 rounded-full animate-pulse-ring [animation-delay:200ms]" />}
              {lit && !isFresh && <span className="absolute inset-0 rounded-full animate-pulse-ring [animation-delay:350ms]" />}
              {label}
            </span>
            {p && (
              <span
                className={`mt-1 truncate rounded-[3px] px-1 font-semibold leading-tight text-chalk ${sz.name} ${sz.maxName} ${
                  isSelected ? "bg-volt text-ink" : "bg-ink/55"
                }`}
              >
                {p.shortName}
              </span>
            )}
          </Tag>
        );
      })}
    </div>
  );
}
