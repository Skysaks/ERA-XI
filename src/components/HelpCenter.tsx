"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import type { HelpId } from "@/help/types";
import { useHelpCatalog } from "@/help/catalog";
import { useI18n } from "@/i18n/react";
import { SheetLoading } from "./ui";
import { LazyRoleSchoolView } from "./lazy";

/**
 * HELP CENTER — progressive disclosure: topic titles, then two or three sentences, then MORE.
 * A deep link opens its topic directly (and scrolls to it). Lazy chunk, text per language.
 */
export default function HelpCenter({ initial }: { initial: HelpId | null }) {
  const { lang } = useI18n();
  const cat = useHelpCatalog(lang);
  const [openId, setOpenId] = useState<HelpId | null>(initial);
  const [more, setMore] = useState<HelpId | null>(null);
  const [school, setSchool] = useState(false);
  const refs = useRef<Partial<Record<HelpId, HTMLLIElement | null>>>({});
  useEffect(() => {
    if (initial && cat) refs.current[initial]?.scrollIntoView({ block: "start" });
  }, [initial, cat]);
  if (!cat) return <SheetLoading />;
  if (school)
    return (
      <div>
        <button type="button" onClick={() => setSchool(false)} className="-ml-1 mb-1 min-h-11 px-1 text-[13px] text-ash-2 hover:text-chalk">
          ← {cat.ui.allTopics}
        </button>
        <Suspense fallback={<SheetLoading />}>
          <LazyRoleSchoolView initial={null} />
        </Suspense>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-snug text-ash-2">{cat.intro}</p>
      <ul className="flex flex-col gap-1.5">
        {cat.sections.map((s) => {
          const isOpen = openId === s.id;
          const deep = more === s.id;
          return (
            <li key={s.id} ref={(el) => void (refs.current[s.id] = el)} className={`scroll-mt-2 rounded-[12px] border ${isOpen ? "border-chalk/25 bg-ink" : "border-line bg-ink"}`}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpenId(isOpen ? null : s.id);
                  setMore(null);
                }}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 text-left"
              >
                <span className="font-display text-[18px] font-bold uppercase leading-tight tracking-[0.03em]">{s.title}</span>
                <span className={`font-display text-[20px] text-ash-2 transition-transform ${isOpen ? "rotate-45" : ""}`} aria-hidden>
                  +
                </span>
              </button>
              {isOpen && (
                <div className="px-3.5 pb-3">
                  <p className="text-[14px] leading-snug text-chalk">{s.short}</p>
                  {s.id === "glossary" && (
                    <dl className="mt-2 flex flex-col">
                      {cat.glossary.map(([term, def]) => (
                        <div key={term} className="border-b border-line py-1.5 last:border-0">
                          <dt className="font-display text-[15px] font-bold uppercase tracking-[0.03em]">{term}</dt>
                          <dd className="text-[12.5px] leading-snug text-ash-2">{def}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {s.more.length > 0 && (
                    <>
                      {deep && (
                        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-[13px] leading-snug text-ash-2 marker:text-volt">
                          {s.more.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      )}
                      <button type="button" onClick={() => setMore(deep ? null : s.id)} className="mt-1 flex min-h-11 items-center text-[12.5px] font-semibold uppercase tracking-[0.12em] text-ash-2 hover:text-chalk">
                        {deep ? cat.ui.less : cat.ui.more} {deep ? "−" : "+"}
                      </button>
                    </>
                  )}
                  {s.id === "roles" && (
                    <button type="button" onClick={() => setSchool(true)} className="mt-1 flex min-h-11 w-full items-center justify-between rounded-[10px] border border-chalk/15 px-3 text-left hover:border-chalk/35">
                      <span className="font-display text-[16px] font-bold uppercase tracking-[0.03em]">{cat.ui.school}</span>
                      <span className="text-ash" aria-hidden>
                        →
                      </span>
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
