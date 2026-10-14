"use client";

import { useState } from "react";
import type { FormationId } from "@/types";
import { getClub, getClubEra, getPlayerEra } from "@/data";
import { useI18n } from "@/i18n/react";
import { useKnowledge, type KnowledgeT } from "@/knowledge/catalog";
import { factMessage, type Fact } from "@/knowledge/facts";
import { roleSchool, type SchoolEntry } from "@/knowledge/profile";

/** Localized fact lines (World Cup, European Cup, Ballon d'Or…). Nothing while the catalog loads. */
export function FactLines({ facts, kt, className = "" }: { facts: Fact[]; kt: KnowledgeT | null; className?: string }) {
  if (!kt || facts.length === 0) return null;
  return (
    <ul className={`flex flex-col gap-0.5 ${className}`}>
      {facts.map((f, i) => {
        const m = factMessage(f);
        return (
          <li key={`${f.kind}-${i}`} className="text-[13px] leading-snug text-chalk">
            <span className="mr-1.5 text-volt" aria-hidden>
              ◆
            </span>
            {kt(m.key, m.params)}
          </li>
        );
      })}
    </ul>
  );
}

/** One formation, three lines: strengths · needs · risk. */
export function FormationNote({ formation, className = "" }: { formation: FormationId; className?: string }) {
  const { t, lang } = useI18n();
  const kt = useKnowledge(lang);
  if (!kt) return null;
  const row = (label: string, key: string, tone: string) => (
    <p className="grid grid-cols-[76px_1fr] gap-2 text-[12.5px] leading-snug">
      <span className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${tone}`}>{label}</span>
      <span className="text-chalk">{kt(`formation.${formation}.${key}`)}</span>
    </p>
  );
  return (
    <div className={`flex flex-col gap-1 rounded-[12px] border border-line bg-ink px-3 py-2.5 ${className}`}>
      {row(t("know.strengths"), "strengths", "text-volt")}
      {row(t("know.needs"), "needs", "text-ash-2")}
      {row(t("know.risk"), "risk", "text-loss")}
    </div>
  );
}

function SchoolCard({ entry, kt, onPlayer }: { entry: SchoolEntry; kt: KnowledgeT; onPlayer?: (id: string) => void }) {
  const { t } = useI18n();
  const concept = entry.id === "regista" || entry.id === "ifb";
  const name = concept ? kt(`school.${entry.id}.name`) : t(`role.${entry.id}`);
  const what = concept ? kt(`school.${entry.id}.what`) : kt(`role.${entry.id}`);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.03em]">{name}</h3>
      <Row label={kt("school.what")} text={what} />
      <Row label={kt("school.strengths")} text={kt(`school.${entry.id}.strengths`)} />
      <Row label={kt("school.needs")} text={kt(`school.${entry.id}.needs`)} />
      {concept && (
        <p className="text-[12px] text-ash">
          {entry.roles.map((r) => t(`role.${r}`)).join(" · ")}
        </p>
      )}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{kt("school.examples")}</p>
        {entry.examples.length ? (
          <ul className="mt-1 flex flex-col gap-1">
            {entry.examples.map((id) => {
              const p = getPlayerEra(id);
              const era = getClubEra(p.clubEraId);
              return (
                <li key={id}>
                  <button type="button" disabled={!onPlayer} onClick={() => onPlayer?.(id)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[10px] border border-line bg-ink px-3 text-left enabled:hover:border-chalk/30">
                    <span className="min-w-0 truncate font-display text-[17px] font-bold uppercase">{p.name}</span>
                    <span className="shrink-0 text-[12px] text-ash-2">
                      {getClub(era.clubId).name} {era.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-[12.5px] text-ash-2">{kt("school.noExamples")}</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-[13.5px] leading-snug">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{label}</span>
      <span className="text-chalk">{text}</span>
    </p>
  );
}

/** ROLE SCHOOL — list of roles, one card at a time. Outside the gameplay loop. */
export function RoleSchoolView({ initial = null, onPlayer }: { initial?: string | null; onPlayer?: (id: string) => void }) {
  const { t, lang } = useI18n();
  const kt = useKnowledge(lang);
  const [open, setOpen] = useState<string | null>(initial);
  if (!kt) return <div className="h-24 animate-pulse rounded-[12px] bg-chalk/[0.04]" aria-busy="true" />;
  const entries = roleSchool();
  const cur = open ? entries.find((e) => e.id === open) : null;
  if (cur)
    return (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setOpen(null)} className="-ml-1 self-start px-1 text-[13px] text-ash-2 min-h-11 hover:text-chalk">
          ← {kt("school.title")}
        </button>
        <SchoolCard entry={cur} kt={kt} onPlayer={onPlayer} />
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-ash-2">{kt("school.intro")}</p>
      <ul className="grid grid-cols-2 gap-1.5">
        {entries.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => setOpen(e.id)} className="flex min-h-11 w-full items-center rounded-[10px] border border-line bg-ink px-3 text-left font-display text-[15px] font-bold uppercase leading-tight tracking-[0.02em] hover:border-chalk/30">
              {e.id === "regista" || e.id === "ifb" ? kt(`school.${e.id}.name`) : t(`role.${e.id}`)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
