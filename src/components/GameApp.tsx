"use client";

import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { DraftChoice, DraftConfig, DraftState, EraBucket, FormationId, ModeId } from "@/types";
import {
  ENGINE_VERSION,
  RULESETS,
  buildChallengePayload,
  createDraft,
  replayDraft,
  currentEvent,
  dailyEventFor,
  dailyKey,
  dailySeed,
  decodeChallenge,
  decodeChoice,
  draftRatings,
  encodeChallenge,
  formationOf,
  freshSeed,
  getFormation,
  lineupPlayers,
  oneClubIds,
  oneLeagueIds,
  previewPick,
  previewPlacement,
  replayFrom,
  type VerifiedChallenge,
} from "@/engine";
import { getClub, getPlayerEra } from "@/data";
import { initialState, reducer, type GameState, type RunContext } from "@/game/machine";
import {
  DEFAULT_PROFILE,
  averagePoints,
  deviceToken,
  loadProfile,
  recordChallenge,
  recordCollection,
  recordDiscovery,
  recordDNA,
  recordRoom,
  recordRun,
  addFeed,
  type FeedEvent,
  rememberFormation,
  rivalryRecord,
  saveProfile,
  type StoredProfile,
} from "@/game/storage";
import { effectiveSettings, type Settings } from "@/game/settings";
import { preferredPosition, toggleFavourite, type Discovery } from "@/game/collection";
import { loadResume, restoreDraft, saveResume, toResume, type ResumeRecord } from "@/game/resume";
import { runDNA } from "@/game/dna";
import { LocalPickQueue, NO_PICK_STATS, offerKey } from "@/stats/pickStats";
import { setAnalyticsEnabled, track } from "@/utils/analytics";
import { detectLang, hasCatalog, loadCatalog, translator, type Lang } from "@/i18n";
import { I18nProvider } from "@/i18n/react";
import { Home } from "./Home";
import { DraftScreen } from "./DraftScreen";
import { XIComplete } from "./XIComplete";
import { SimulationReveal } from "./SimulationReveal";
import { ResultScreen, type RecordContext } from "./ResultScreen";
import { ShareSheet } from "./ShareSheet";
import { ChallengeIntro, RivalResult } from "./ChallengeScreens";
import type { RoomEntry, RoomPlatform, SeasonDone } from "./DuelApp";
import { LazyAnalysisSheet, LazyDuelApp, prefetchSecondary } from "./lazy";
import { HelpProvider } from "./help";
import { feedback } from "./feedback";
import { ErrorBoundary } from "./ErrorBoundary";
import { BrandLoading } from "./ui";

export interface GameAppProps {
  /** Challenge token from the route (/c/[token]) — decoded synchronously, no network. */
  initialToken?: string | null;
  /** How a challenge link is built on this platform (web route vs. hash for the standalone build). */
  buildChallengeUrl?: (token: string) => string;
  /** Reset the address bar when leaving a challenge. */
  resetUrl?: () => void;
  /** Read a challenge token from the current location (hash/query/path), if any. */
  readLocationToken?: () => string | null;
  /** Whether the platform allows file download / Web Share for the card image. */
  imageSharing?: boolean;
  /** Live rooms on this platform (HTTP server, peer presence, or practice-only). */
  rooms?: RoomPlatform;
  /** A room code from the current location (/r/code or #r-code), if any. */
  initialRoom?: string | null;
  /** The platform can be installed as an app (web build with a service worker). */
  installable?: boolean;
}

const pickQueue = new LocalPickQueue(
  typeof window === "undefined"
    ? null
    : {
        get: (k) => {
          try {
            return window.localStorage.getItem(k);
          } catch {
            return null;
          }
        },
        set: (k, v) => {
          try {
            window.localStorage.setItem(k, v);
          } catch {
            /* ignore */
          }
        },
      },
);

const PRACTICE_ONLY: RoomPlatform = {
  connect: async () => null,
  roomUrl: () => "",
  setLocationRoom: () => {},
};

function defaultChallengeUrl(token: string) {
  return `${window.location.origin}/c/${token}`;
}

function initFromToken(token: string | null | undefined): GameState {
  if (!token) return initialState;
  const d = decodeChallenge(token);
  if (d.ok) return { phase: "CHALLENGE_INTRO", challenge: d.challenge };
  return { phase: "HOME", notice: `notice.${d.reason}` };
}

function formatDay(key: string, lang: Lang) {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The player's pre-draft choice for this mode, if the mode offers one and it is still valid. */
function choiceFor(mode: ModeId, prefs: StoredProfile["prefs"]): DraftChoice | undefined {
  const kind = RULESETS[mode].playerChoice;
  if (kind === "bucket" && prefs.eraBucket) return { bucket: prefs.eraBucket };
  if (kind === "club" && prefs.oneClub && oneClubIds().includes(prefs.oneClub)) return { clubId: prefs.oneClub };
  if (kind === "league" && prefs.oneLeague && oneLeagueIds().includes(prefs.oneLeague)) return { league: prefs.oneLeague };
  return undefined;
}

/** Browser history: one entry for "in a game", so Back returns Home (the run is autosaved). */
function pushGameEntry() {
  try {
    if ((window.history.state as { eraxi?: string } | null)?.eraxi !== "game") window.history.pushState({ eraxi: "game" }, "");
  } catch {
    /* sandboxed frames may refuse history writes */
  }
}

const landingAt = typeof performance === "undefined" ? 0 : performance.now();
let sessionRuns = 0;
let firstPlayTracked = false;

export function GameApp({
  initialToken = null,
  buildChallengeUrl = defaultChallengeUrl,
  resetUrl,
  readLocationToken,
  imageSharing = true,
  rooms = PRACTICE_ONLY,
  initialRoom = null,
  installable = false,
}: GameAppProps) {
  const [state, dispatch] = useReducer(reducer, initialToken, initFromToken);
  const [room, setRoom] = useState<RoomEntry | null>(initialRoom ? { kind: "join", code: initialRoom } : null);
  const [roomBack, setRoomBack] = useState(0);
  const [profile, setProfile] = useState<StoredProfile>(DEFAULT_PROFILE);
  const [resume, setResume] = useState<ResumeRecord | null>(null);
  const [booted, setBooted] = useState(false);
  const [browserLang, setBrowserLang] = useState<Lang>("en");
  const [today, setToday] = useState<string | null>(null);
  const [share, setShare] = useState<null | "challenge" | "rival">(null);
  // The biggest turning point Analysis found for the current result (keyed to that run).
  const [turning, setTurning] = useState<{ key: string; round: number; pts: number } | null>(null);
  const [analysis, setAnalysis] = useState(false);
  const [lastRecord, setLastRecord] = useState<({ key: string; ptsLabel: boolean; achievements: string[]; savedId: string | null; discovery: Discovery | null } & RecordContext) | null>(null);
  const lastPickAt = useRef(0);
  const roundStartedAt = useRef(0);
  const recorded = useRef<string | null>(null);
  const phaseRef = useRef(state.phase);
  const stateRef = useRef(state);
  stateRef.current = state;

  const lang: Lang = profile.prefs.lang ?? browserLang;
  const tr = useMemo(() => translator(lang), [lang]);
  const settings = profile.settings;

  // First paint also waits (at most 800 ms) for the display fonts: the condensed headings
  // otherwise re-flow when the web font swaps in (measured CLS 0.16 on Home without this).
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setFontsReady(true);
      }
    };
    const timer = setTimeout(finish, 800);
    try {
      const f = document.fonts;
      if (!f?.load) finish();
      else Promise.all([f.load('800 40px "Barlow Condensed"'), f.load('700 20px "Barlow Condensed"'), f.load('400 15px "Inter Variable"')]).then(finish, finish);
    } catch {
      finish();
    }
    return () => clearTimeout(timer);
  }, []);

  // ── boot: profile, language, date, location token, landing analytics ──
  useEffect(() => {
    const p = loadProfile();
    if (!p.account.guestId) {
      p.account = { kind: "guest", guestId: deviceToken().slice(0, 12) };
      saveProfile(p);
    }
    setProfile(p);
    setResume(p.settings.resume ? loadResume() : null);
    setAnalyticsEnabled(p.settings.analytics);
    const detected = detectLang(typeof navigator === "undefined" ? undefined : navigator);
    setBrowserLang(detected);
    setToday(dailyKey(new Date()));
    // French / Spanish are their own chunks: first paint waits for the active one (English
    // fallback if it cannot load), so the UI never flashes in the wrong language.
    const bootLang = p.prefs.lang ?? detected;
    const go = () => {
      setBooted(true);
      prefetchSecondary(bootLang);
    };
    if (hasCatalog(bootLang)) go();
    else loadCatalog(bootLang).then(go, go);
    track({ name: "landing_view", hasChallenge: Boolean(initialToken) });
    if (initialToken) {
      const d = decodeChallenge(initialToken);
      track({ name: "challenge_opened", valid: d.ok, reason: d.ok ? undefined : d.reason });
    } else {
      const tk = readLocationToken?.();
      if (tk) {
        const d = decodeChallenge(tk);
        track({ name: "challenge_opened", valid: d.ok, reason: d.ok ? undefined : d.reason });
        if (d.ok) dispatch({ type: "OPEN_CHALLENGE", challenge: d.challenge });
        else dispatch({ type: "CHALLENGE_REJECTED", notice: `notice.${d.reason}` });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Accessibility + privacy settings live on <html> so every screen follows them.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dataset.motion = settings.motion === "system" ? "" : settings.motion;
    root.dataset.contrast = settings.highContrast ? "high" : "";
    root.dataset.text = settings.largeText ? "large" : "";
    setAnalyticsEnabled(settings.analytics);
  }, [lang, settings]);

  const updateProfile = useCallback((fn: (p: StoredProfile) => StoredProfile) => {
    setProfile((prev) => {
      const next = fn(prev);
      saveProfile(next);
      return next;
    });
  }, []);
  const setLang = useCallback(
    (l: Lang) => {
      const apply = () => updateProfile((p) => ({ ...p, prefs: { ...p.prefs, lang: l } }));
      if (hasCatalog(l)) apply();
      else loadCatalog(l).then(apply, apply);
    },
    [updateProfile],
  );
  const setSettings = useCallback(
    (patch: Partial<Settings>) => {
      for (const k of Object.keys(patch)) track({ name: "settings_changed", key: k });
      updateProfile((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
      if (patch.resume === false) {
        saveResume(null);
        setResume(null);
      }
    },
    [updateProfile],
  );

  // ── phase side effects ──
  useEffect(() => {
    if (phaseRef.current !== state.phase) {
      window.scrollTo(0, 0);
      if (phaseRef.current === "HOME" && state.phase !== "HOME") pushGameEntry();
      phaseRef.current = state.phase;
    }
  }, [state.phase]);

  // AUTOSAVE: every decision of a solo run is persisted, so Home/Back/closing never loses it.
  useEffect(() => {
    if (!settings.resume) return;
    if (state.phase === "DRAFTING" || state.phase === "XI_COMPLETE") {
      if (state.draft.picks.length === 0 && state.phase === "DRAFTING") return;
      const rec = toResume(state.draft, { challengeToken: state.run.challenge?.token ?? null, rival: state.run.rival, startedAt: state.run.startedAt, practice: state.run.practice });
      saveResume(rec);
      setResume(rec);
    } else if (state.phase === "SIMULATING") {
      saveResume(null);
      setResume(null);
    }
  }, [state, settings.resume]);

  // Browser Back: in a game → Home (autosaved); in a live room → the room's own confirmation.
  useEffect(() => {
    const onPop = () => {
      if (room) {
        pushGameEntry();
        setRoomBack((n) => n + 1);
      } else if (stateRef.current.phase !== "HOME") {
        resetUrl?.();
        dispatch({ type: "HOME" });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [room, resetUrl]);

  // Record the run as soon as its result exists (SIMULATING), so leaving mid-reveal never loses it.
  useEffect(() => {
    if (state.phase !== "SIMULATING" && state.phase !== "RESULT" && state.phase !== "CHALLENGE_RESULT") return;
    const { draft, result, run } = state;
    const key = `${draft.config.seed}:${run.startedAt}`;
    if (recorded.current === key) return;
    recorded.current = key;
    // Practice (replay from a round): shown, never recorded — it can't replace an official result.
    if (run.practice) return;
    const cfg = draft.config;
    const prev = loadProfile();
    let token: string | null = null;
    try {
      token = encodeChallenge(buildChallengePayload(draft, result, prev.name || undefined));
    } catch {
      token = null;
    }
    const outcome = recordRun(
      prev,
      {
        at: Date.now(),
        seed: cfg.seed,
        points: result.points,
        wins: result.wins,
        draws: result.draws,
        losses: result.losses,
        formation: cfg.formation,
        mode: cfg.mode,
        overall: result.teamRatings.overall,
        fit: result.teamRatings.fit,
        daily: cfg.daily,
        challengeOf: run.challenge?.creatorName ?? null,
        ...(run.rival ? { rival: run.rival } : {}),
        rerollUsed: draft.rerollRound !== null,
      },
      result,
      token,
    );
    // Collection first: the discovery moment compares against the passport BEFORE this run.
    const coll = recordCollection(outcome.profile, draft, result, token, prev.games);
    let next = recordDiscovery(coll.profile, draft);
    try {
      next = recordDNA(next, runDNA(draft));
    } catch {
      /* DNA is best-effort */
    }
    if (run.challenge) {
      next = recordChallenge(next, {
        at: Date.now(),
        token: run.challenge.token,
        opponent: run.challenge.creatorName ?? "Friend",
        theirs: run.challenge.creatorResult.points,
        yours: result.points,
      });
    }
    // MY ERA activity: only what this device witnessed.
    const now = Date.now();
    const feed: FeedEvent[] = [];
    if (run.challenge && run.challenge.creatorName) {
      const theirs = run.challenge.creatorResult.points;
      feed.push({ at: now, k: "vs", opp: run.challenge.creatorName, yours: result.points, theirs, won: result.points === theirs ? null : result.points > theirs });
    }
    if (outcome.isBest) feed.push({ at: now, k: "pb", n: result.points, prev: outcome.previousBest });
    if (coll.discovery) feed.push({ at: now, k: coll.discovery.kind, id: coll.discovery.id });
    for (const id of outcome.achievements) feed.push({ at: now, k: "ach", id });
    next = addFeed(next, feed);
    saveProfile(next);
    setProfile(next);
    pickQueue.settle({ engineVersion: cfg.engineVersion, seed: cfg.seed, rulesetId: cfg.mode }, result.points, null);
    sessionRuns++;
    track({ name: "session_runs", count: sessionRuns });
    if (next.games === 1) track({ name: "first_game_completion", ...cfgProps(cfg) });
    setLastRecord({
      key,
      ptsLabel: prev.scoringSeen < 2,
      isBest: outcome.isBest,
      previousBest: outcome.previousBest,
      isModeBest: outcome.isModeBest,
      previousModeBest: outcome.previousModeBest,
      dailyAttempt: outcome.dailyAttempt,
      achievements: outcome.achievements,
      savedId: next.gallery[0]?.seed === cfg.seed ? next.gallery[0].id : null,
      discovery: coll.discovery,
    });
    track({ name: "result_viewed", points: result.points, isBest: outcome.isBest, ...cfgProps(cfg) });
  }, [state]);

  useEffect(() => {
    if (state.phase === "CHALLENGE_RESULT" && state.run.challenge) {
      track({ name: "challenge_completed", outcome: state.comparison.outcome, margin: state.result.points - state.run.challenge.creatorResult.points, ...cfgProps(state.draft.config) });
    }
  }, [state]);

  // ── actions ──
  const start = useCallback(
    (config: DraftConfig, opts: { challenge?: VerifiedChallenge | null; rival?: string | null } = {}) => {
      const now = Date.now();
      roundStartedAt.current = now;
      lastPickAt.current = 0;
      if (!firstPlayTracked) {
        firstPlayTracked = true;
        track({ name: "time_to_first_play", ms: Math.round(performance.now() - landingAt) });
      }
      if (profile.games === 1) track({ name: "second_game_start" });
      dispatch({ type: "START", config, challenge: opts.challenge ?? null, rival: opts.rival ?? null, now });
      track({ name: opts.challenge ? "challenge_started" : "game_started", ...cfgProps(config) });
    },
    [profile.games],
  );

  const resumeRun = useCallback(
    (r: ResumeRecord) => {
      const draft = restoreDraft(r);
      if (!draft) {
        saveResume(null);
        setResume(null);
        return false;
      }
      let challenge: VerifiedChallenge | null = null;
      if (r.challengeToken) {
        const d = decodeChallenge(r.challengeToken);
        if (d.ok) challenge = d.challenge;
      }
      const run: RunContext = { challenge, rival: r.rival, startedAt: r.startedAt, ...(r.practice ? { practice: true } : {}) };
      roundStartedAt.current = Date.now();
      lastPickAt.current = 0;
      track({ name: "resume_draft", round: draft.round, ...cfgProps(draft.config) });
      dispatch({ type: "RESUME", draft, run });
      return true;
    },
    [],
  );

  const playFresh = useCallback(
    (source: "home" | "daily" | "weekly" = "home") => {
      const prefs = profile.prefs;
      const daily = source === "daily" ? today ?? dailyKey(new Date()) : undefined;
      // Daily XI: resume today's unfinished attempt instead of restarting it.
      if (daily && resume?.config.daily === daily && resumeRun(resume)) return;
      if (daily) {
        const days = Object.keys(profile.daily).sort();
        const last = days[days.length - 1];
        const gap = last ? Math.round((Date.parse(daily) - Date.parse(last)) / 86_400_000) : null;
        if (!profile.daily[daily]) track({ name: "daily_return", daysSinceLast: gap });
      }
      const mode: ModeId = daily ? "daily" : source === "weekly" ? "weekly" : prefs.mode;
      const config: DraftConfig = { seed: daily ? dailySeed(daily) : freshSeed(), formation: prefs.formation, mode, engineVersion: ENGINE_VERSION, daily };
      if (mode === "weekly") config.event = currentEvent().event.id;
      else if (daily) config.event = dailyEventFor(daily);
      const choice = daily || mode === "weekly" ? undefined : choiceFor(mode, prefs);
      if (choice) config.choice = choice;
      track({ name: "play_clicked", source: source === "daily" ? "daily" : "home", ...cfgProps(config) });
      resetUrl?.();
      start(config);
    },
    [profile.prefs, profile.daily, today, start, resetUrl, resume, resumeRun],
  );

  /** Same seed, new decisions. Daily/challenge rules still apply (an official Daily is never overwritten). */
  const runItBack = useCallback(() => {
    if (state.phase !== "RESULT" && state.phase !== "CHALLENGE_RESULT") return;
    const afterPB = Boolean(lastRecord?.isBest);
    track({ name: "run_it_back", afterPersonalBest: afterPB, ...cfgProps(state.draft.config) });
    if (afterPB) track({ name: "personal_best_replay" });
    start(state.draft.config, { challenge: state.run.challenge, rival: state.run.rival });
  }, [state, start, lastRecord]);

  const onPick = useCallback(
    (optionIndex: number) => {
      if (state.phase !== "DRAFTING") return;
      const now = performance.now();
      // Guard against a double-tap landing on the next round's options.
      if (now - lastPickAt.current < 220) return;
      lastPickAt.current = now;
      const draft = state.draft;
      const offer = draft.rerollRound === draft.round ? draft.draw.reserve : draft.draw.rounds[draft.round];
      const id = offer?.options[optionIndex];
      if (!id) return;
      feedback("pick", settings);
      const landing = previewPlacement(draft, optionIndex);
      track({
        name: "player_selected",
        round: draft.round + 1,
        optionIndex,
        playerEraId: id,
        overall: getPlayerEra(id).overall,
        outOfPosition: landing?.outOfPosition ?? false,
        msSinceRoundStart: Math.round(Date.now() - roundStartedAt.current),
        ...cfgProps(draft.config),
      });
      roundStartedAt.current = Date.now();
      pickQueue.record({
        engineVersion: draft.config.engineVersion,
        seed: draft.config.seed,
        rulesetId: draft.config.mode,
        round: draft.round,
        clubEraId: offer?.clubEraId ?? "",
        options: offer?.options.slice() ?? [],
        optionIndex,
        playerEraId: id,
        fitDelta: previewPick(draft, optionIndex)?.fitDelta ?? 0,
        position: previewPick(draft, optionIndex)?.position,
        formation: formationOf(draft),
        finalPoints: null,
        duelWon: null,
        at: Date.now(),
      });
      dispatch({ type: "PICK", optionIndex });
      if (draft.round + 1 === 11) {
        const r = draftRatings(draft);
        track({ name: "draft_completed", durationMs: Date.now() - state.run.startedAt, fit: r.fit, overall: r.overall, ...cfgProps(draft.config) });
      }
    },
    [state, settings],
  );

  const onReroll = useCallback(() => {
    if (state.phase !== "DRAFTING" || state.draft.rerollRound !== null) return;
    track({ name: "reroll_used", round: state.draft.round + 1, ...cfgProps(state.draft.config) });
    dispatch({ type: "REROLL" });
  }, [state]);

  const simulate = useCallback(() => {
    if (state.phase !== "XI_COMPLETE") return;
    track({ name: "simulation_started", ...cfgProps(state.draft.config) });
    dispatch({ type: "SIMULATE" });
    // "Instant" skips the reveal; the result is identical either way.
    if (settings.simSpeed === "instant") dispatch({ type: "REVEAL_DONE" });
  }, [state, settings.simSpeed]);

  /** Home from anywhere. Solo runs are autosaved, so there is nothing to confirm. */
  const goHome = useCallback(() => {
    setShare(null);
    setAnalysis(false);
    resetUrl?.();
    dispatch({ type: "HOME" });
    try {
      if ((window.history.state as { eraxi?: string } | null)?.eraxi === "game") window.history.replaceState(null, "");
    } catch {
      /* ignore */
    }
  }, [resetUrl]);

  // ── share builders ──
  const tokenFor = useCallback(
    (name: string | null) => {
      if (state.phase !== "RESULT" && state.phase !== "CHALLENGE_RESULT") return "";
      return encodeChallenge(buildChallengePayload(state.draft, state.result, name ?? undefined));
    },
    [state],
  );

  const replayFromRound = useCallback(
    (round: number) => {
      if (state.phase !== "RESULT" && state.phase !== "CHALLENGE_RESULT") return;
      setAnalysis(false);
      const draft = replayFrom(state.draft, round);
      track({ name: "replay_from_round", round, ...cfgProps(draft.config) });
      roundStartedAt.current = Date.now();
      dispatch({ type: "RESUME", draft, run: { challenge: state.run.challenge, rival: state.run.rival, startedAt: Date.now(), practice: true } });
    },
    [state],
  );
  const onTurning = useCallback(
    (x: { round: number; pts: number } | null) => {
      if (state.phase !== "RESULT") return;
      const key = `${state.draft.config.seed}:${state.run.startedAt}`;
      setTurning(x ? { key, ...x } : null);
    },
    [state],
  );

  const shareProps = useMemo(() => {
    if (state.phase !== "RESULT" && state.phase !== "CHALLENGE_RESULT") return null;
    const { draft, result } = state;
    const formation = getFormation(formationOf(draft));
    const players = lineupPlayers(draft);
    const t = tr.t;
    const context = contextLabel(t, draft);
    const modeLabel = context ? `${t(`mode.${draft.config.mode}.name`)} · ${context}` : t(`mode.${draft.config.mode}.name`);
    if (share === "rival" && state.phase === "CHALLENGE_RESULT") {
      const c = state.comparison;
      const rivalName = state.run.challenge?.creatorName ?? t("shareText.myFriend");
      return {
        title: t("share.resultTitle"),
        card: () => ({
          kind: "rival" as const,
          t,
          rivalName,
          yours: c.yourScore,
          theirs: c.theirScore,
          outcome: c.outcome,
          decisive: c.decisive?.impact ? { yours: c.decisive.yours, theirs: c.decisive.theirs, pts: c.decisive.impact.pts } : null,
          result,
          formation,
          modeLabel,
          players,
        }),
        text: () => t(c.outcome === "win" ? "shareText.win" : c.outcome === "loss" ? "shareText.loss" : "shareText.draw", { name: rivalName, a: c.yourScore, b: c.theirScore }),
      };
    }
    const rival = state.run.rival;
    return {
      title: rival ? t("share.rematchTitle", { name: rival }) : t("share.challengeTitle"),
      card: (name: string | null) => ({ kind: "challenge" as const, t, name, result, formation, modeLabel, players }),
      text: () =>
        result.format === "gauntlet"
          ? t("shareText.gauntlet", { pts: result.points, max: result.maxPoints })
          : rival
            ? t("shareText.rematch", { name: rival, pts: result.points, max: result.maxPoints })
            : t("shareText.challenge", { pts: result.points, max: result.maxPoints }),
    };
  }, [state, share, tr]);

  const openShare = (kind: "challenge" | "rival") => {
    if (state.phase === "RESULT" || state.phase === "CHALLENGE_RESULT") {
      track({ name: "challenge_created", points: state.result.points, hasName: Boolean(profile.name.trim()), ...cfgProps(state.draft.config) });
    }
    setShare(kind);
  };

  const rivalryFor = (name: string | null) => (name ? rivalryRecord(profile, name) : null);

  // ── live rooms ──
  const token = useMemo(() => (typeof window === "undefined" ? "server-render-token-0" : deviceToken()), []);
  const roomSeasons = useRef(new Set<string>());
  const onRoomSeason = useCallback((s: SeasonDone) => {
    if (roomSeasons.current.has(s.key)) return;
    roomSeasons.current.add(s.key);
    const cfg = s.draft.config;
    const out = recordRun(
      loadProfile(),
      {
        at: Date.now(),
        seed: cfg.seed,
        points: s.result.points,
        wins: s.result.wins,
        draws: s.result.draws,
        losses: s.result.losses,
        formation: cfg.formation,
        mode: cfg.mode,
        overall: s.result.teamRatings.overall,
        fit: s.result.teamRatings.fit,
      },
      s.result,
    );
    const next = recordDiscovery(out.profile, s.draft);
    saveProfile(next);
    setProfile(next);
    track({ name: "result_viewed", points: s.result.points, isBest: out.isBest, ...cfgProps(cfg) });
  }, []);
  const onRoomResult = useCallback((r: { key: string; kind: "duel" | "party"; won: boolean; vs?: { opponent: string; yours: number; theirs: number } }) => {
    track({ name: "room_finished", kind: r.kind, won: r.won });
    if (r.kind === "duel") track({ name: "duel_completion", rulesetId: "duel", won: r.won });
    const next = recordRoom(loadProfile(), r.key, r.kind, r.won, r.vs);
    saveProfile(next);
    setProfile(next);
  }, []);
  const openRoom = useCallback(
    (e: RoomEntry) => {
      resetUrl?.();
      track({ name: "room_opened", action: e.kind, rulesetId: e.kind === "join" ? "unknown" : e.rulesetId });
      track({ name: "duel_start", rulesetId: e.kind === "join" ? "unknown" : e.rulesetId });
      pushGameEntry();
      setRoom(e);
    },
    [resetUrl],
  );

  // First paint waits for the stored profile, so the language never flashes.
  if (!booted || !fontsReady) return <div className="min-h-dvh bg-ink" />;

  // Official Daily attempts and received challenges: everyone decides with the same aids.
  const competitive = (s: GameState) =>
    (s.phase === "DRAFTING" || s.phase === "XI_COMPLETE") && ((Boolean(s.draft.config.daily) && !profile.daily[s.draft.config.daily ?? ""]) || Boolean(s.run.challenge));
  const drafting = effectiveSettings(settings, { competitive: competitive(state) });

  const content = (() => {
    if (room) {
      return (
        <LazyDuelApp
          key={room.kind === "join" ? room.code : `${room.kind}-${room.rulesetId}`}
          entry={room}
          platform={rooms}
          token={token}
          nickname={profile.name}
          backSignal={roomBack}
          onNickname={(n) => updateProfile((p) => ({ ...p, name: n }))}
          onExit={() => {
            setRoom(null);
            dispatch({ type: "HOME" });
          }}
          onSeason={onRoomSeason}
          onRoomResult={onRoomResult}
          duelRecord={profile.career.duel}
          onPracticeDraw={(cfg) => {
            // The duel's draw, solo, as practice: never recorded, never a result.
            setRoom(null);
            roundStartedAt.current = Date.now();
            const base = { seed: cfg.seed, formation: cfg.formation, engineVersion: cfg.engineVersion, mode: cfg.mode as ModeId };
            dispatch({ type: "RESUME", draft: cfg.picks?.length ? replayDraft(base, cfg.picks, null) : createDraft(base), run: { challenge: null, rival: null, startedAt: Date.now(), practice: true } });
          }}
        />
      );
    }
    switch (state.phase) {
      case "HOME":
        return (
          <Home
            mode={profile.prefs.mode}
            formation={profile.prefs.formation}
            eraBucket={profile.prefs.eraBucket}
            oneClub={profile.prefs.oneClub}
            oneLeague={profile.prefs.oneLeague}
            onMode={(m: ModeId) => updateProfile((p) => ({ ...p, prefs: { ...p.prefs, mode: m } }))}
            onFormation={(f: FormationId) => updateProfile((p) => ({ ...p, prefs: { ...p.prefs, formation: f, recentFormations: rememberFormation(p.prefs.recentFormations ?? [], f) } }))}
            onEraBucket={(b: EraBucket | null) => updateProfile((p) => ({ ...p, prefs: { ...p.prefs, eraBucket: b } }))}
            onOneClub={(c: string | null) => updateProfile((p) => ({ ...p, prefs: { ...p.prefs, oneClub: c } }))}
            onOneLeague={(c: string | null) => updateProfile((p) => ({ ...p, prefs: { ...p.prefs, oneLeague: c } }))}
            onPlay={() => playFresh("home")}
            onDaily={() => playFresh("daily")}
            onWeekly={() => playFresh("weekly")}
            resume={resume}
            onResume={() => resume && resumeRun(resume)}
            onDiscardResume={() => {
              saveResume(null);
              setResume(null);
            }}
            dailyLabel={today ? formatDay(today, lang) : "—"}
            dailyPlayed={today ? profile.daily[today]?.official.points ?? null : null}
            notice={state.notice}
            profile={profile}
            average={averagePoints(profile)}
            onNameChange={(n) => updateProfile((p) => ({ ...p, name: n }))}
            onCreateRoom={(rulesetId) => openRoom({ kind: "create", rulesetId, formation: profile.prefs.formation })}
            onJoinRoom={(code) => openRoom({ kind: "join", code })}
            settings={settings}
            onSettings={setSettings}
            updateProfile={updateProfile}
            installable={installable}
            onToggleFavourite={(id) => updateProfile((p) => ({ ...p, gallery: toggleFavourite(p.gallery, id) }))}
            onPlayDraw={(token) => {
              const d = decodeChallenge(token);
              if (d.ok) dispatch({ type: "OPEN_CHALLENGE", challenge: d.challenge });
            }}
            linkFor={buildChallengeUrl}
            today={today}
            onRematch={(name) => {
              resetUrl?.();
              const prefs = profile.prefs;
              const mode: ModeId = prefs.mode === "weekly" || prefs.mode === "daily" ? "classic" : prefs.mode;
              const config: DraftConfig = { seed: freshSeed(), formation: prefs.formation, mode, engineVersion: ENGINE_VERSION };
              const choice = choiceFor(mode, prefs);
              if (choice) config.choice = choice;
              track({ name: "play_clicked", source: "home", ...cfgProps(config) });
              start(config, { rival: name });
            }}
          />
        );
      case "CHALLENGE_INTRO": {
        const c = state.challenge;
        return (
          <ChallengeIntro
            challenge={c}
            onPlay={() => {
              const config: DraftConfig = { seed: c.payload.s, formation: c.payload.f, mode: c.payload.m, engineVersion: c.payload.e, daily: c.payload.d };
              const choice = decodeChoice(c.payload.c);
              if (choice) config.choice = choice;
              if (c.payload.w) config.event = c.payload.w;
              start(config, { challenge: c });
            }}
            onFresh={() => playFresh("home")}
            onHome={goHome}
            ptsLabel={profile.scoringSeen < 2}
          />
        );
      }
      case "DRAFTING": {
        const practice = Boolean(state.run.practice || (state.draft.config.daily && profile.daily[state.draft.config.daily]));
        const canMove = !state.draft.draw.targets;
        const offerId = offerKey({ engineVersion: state.draft.config.engineVersion, seed: state.draft.config.seed, rulesetId: state.draft.config.mode, round: Math.max(0, state.draft.round - 1) });
        const last = state.lastPick;
        // Popularity only after the player's own pick, and only from real data (none shipped yet).
        const rate = drafting.postPickStats && last ? NO_PICK_STATS.pickRate(offerId, last.playerEraId) : null;
        return (
          <DraftScreen
            draft={state.draft}
            lastPick={state.lastPick}
            showRatings={RULESETS[state.draft.config.mode].ratingsVisible}
            challengeLabel={draftLabel(tr.t, state.draft, state.run.challenge?.creatorName ?? null, Boolean(state.run.challenge), practice)}
            onPick={onPick}
            onReroll={onReroll}
            onExit={goHome}
            hints={drafting.hints}
            preview={drafting.preview}
            postPickRate={rate}
            selectedSlot={canMove ? state.selectedSlot ?? null : null}
            onTapSlot={canMove ? (i) => dispatch({ type: "TAP_SLOT", index: i }) : undefined}
            onClearSelection={() => dispatch({ type: "CLEAR_SELECTION" })}
            guide={profile.games === 0 && drafting.hints}
            knowledge={settings.knowledge}
            onMoment={() => feedback("tactic", settings)}
            historyOf={(pid) => {
              const row = profile.history[pid];
              return row ? { seen: row[0], drafted: row[1], best: row[2], pos: preferredPosition(row) } : null;
            }}
          />
        );
      }
      case "XI_COMPLETE":
        return (
          <XIComplete
            draft={state.draft}
            selectedSlot={state.selectedSlot}
            onTapSlot={(i) => dispatch({ type: "TAP_SLOT", index: i })}
            onSimulate={simulate}
            onHome={goHome}
            onSetDraft={(d) => {
              track({ name: "xi_adjusted", ...cfgProps(d.config) });
              dispatch({ type: "SET_DRAFT", draft: d });
            }}
            onClearSelection={() => dispatch({ type: "CLEAR_SELECTION" })}
          />
        );
      case "SIMULATING":
        return (
          <SimulationReveal
            result={state.result}
            ptsLabel={profile.scoringSeen < 2}
            speed={settings.simSpeed}
            personalBest={lastRecord?.previousBest ?? null}
            onHome={goHome}
            onDone={() => {
              track({ name: "simulation_completed", points: state.result.points, ...cfgProps(state.draft.config) });
              dispatch({ type: "REVEAL_DONE" });
            }}
            onSkip={(md) => {
              track({ name: "simulation_skipped", atMatchday: md, ...cfgProps(state.draft.config) });
              dispatch({ type: "REVEAL_DONE" });
            }}
          />
        );
      case "RESULT": {
        const key = `${state.draft.config.seed}:${state.run.startedAt}`;
        const rec = lastRecord?.key === key ? lastRecord : null;
        return (
          <ResultScreen
            draft={state.draft}
            result={state.result}
            record={rec}
            onCelebrate={(cue) => feedback(cue, settings)}
            achievements={rec?.achievements ?? []}
            ptsLabel={rec?.ptsLabel ?? profile.scoringSeen < 2}
            rival={state.run.rival}
            onChallenge={() => openShare("challenge")}
            onPlayAgain={() => {
              track({ name: "play_again_clicked", from: "result", ...cfgProps(state.draft.config) });
              if (rec?.isBest) track({ name: "personal_best_replay" });
              playFresh(state.draft.config.mode === "weekly" ? "weekly" : "home");
            }}
            onRunItBack={runItBack}
            onAnalysis={() => {
              track({ name: "analysis_opened", ...cfgProps(state.draft.config) });
              setAnalysis(true);
            }}
            practice={Boolean(state.run.practice)}
            onHome={goHome}
            discovery={rec?.discovery ?? null}
            turning={turning?.key === key ? turning : null}
            onReplayFrom={replayFromRound}
            favourite={Boolean(rec?.savedId && profile.gallery.find((x) => x.id === rec.savedId)?.favourite)}
            onFavourite={rec?.savedId ? () => updateProfile((p) => ({ ...p, gallery: toggleFavourite(p.gallery, rec.savedId!) })) : undefined}
          />
        );
      }
      case "CHALLENGE_RESULT": {
        const c = state.run.challenge;
        if (!c) return null;
        return (
          <RivalResult
            challenge={c}
            draft={state.draft}
            result={state.result}
            comparison={state.comparison}
            record={rivalryFor(c.creatorName)}
            onHome={goHome}
            onRunItBack={runItBack}
            onRematch={() => {
              resetUrl?.();
              const mode = c.payload.m === "daily" ? "classic" : c.payload.m;
              const config: DraftConfig = { seed: freshSeed(), formation: c.payload.f, mode, engineVersion: ENGINE_VERSION };
              const choice = decodeChoice(c.payload.c);
              if (choice) config.choice = choice;
              if (mode === "weekly") config.event = c.payload.w ?? currentEvent().event.id;
              start(config, { rival: c.creatorName ?? "Friend" });
            }}
            onShare={() => openShare("rival")}
            onPlayAgain={() => {
              track({ name: "play_again_clicked", from: "challenge_result", ...cfgProps(state.draft.config) });
              playFresh("home");
            }}
          />
        );
      }
    }
  })();

  return (
    <I18nProvider lang={lang} setLang={setLang}>
      <HelpProvider>
      <ErrorBoundary
        resetKey={room ? `room-${room.kind}` : state.phase}
        onRecover={() => {
          // A failure on Home itself can only come from stored state: drop the saved draft.
          if (state.phase === "HOME" && !room) {
            saveResume(null);
            setResume(null);
          }
          setRoom(null);
          setAnalysis(false);
          dispatch({ type: "HOME" });
        }}
        onError={(e) => track({ name: "app_error", phase: room ? "room" : state.phase, message: String(e.message).slice(0, 120) })}
      >
        <Suspense fallback={<BrandLoading />}>{content}</Suspense>
      </ErrorBoundary>
      {!room && shareProps && (
        <ShareSheet
          open={share !== null}
          onClose={() => setShare(null)}
          title={shareProps.title}
          card={shareProps.card}
          text={shareProps.text}
          link={(name) => buildChallengeUrl(tokenFor(name))}
          name={profile.name}
          imageSharing={imageSharing}
          onNameChange={(n) => updateProfile((p) => ({ ...p, name: n }))}
          onShared={(channel) => {
            if (state.phase === "RESULT" || state.phase === "CHALLENGE_RESULT") {
              track({ name: "share_clicked", channel, ...cfgProps(state.draft.config) });
              track({ name: "challenge_send", channel });
            }
          }}
        />
      )}
      {!room && (state.phase === "RESULT" || state.phase === "CHALLENGE_RESULT") && (
        <Suspense fallback={null}>
        <LazyAnalysisSheet
          open={analysis}
          onClose={() => setAnalysis(false)}
          result={state.result}
          draft={state.draft}
          onRunItBack={() => {
            setAnalysis(false);
            runItBack();
          }}
          onReplayFrom={replayFromRound}
          onTurning={onTurning}
        />
        </Suspense>
      )}
      </HelpProvider>
    </I18nProvider>
  );
}

/** "1990s" / "Barcelona" / "England" / weekly theme — the draw's context for labels. */
export function contextLabel(t: (k: string, p?: Record<string, string | number>) => string, draft: DraftState): string | null {
  if (draft.draw.bucket) return t(`bucket.${draft.draw.bucket}`);
  if (draft.draw.clubId) return getClub(draft.draw.clubId).name;
  if (draft.draw.league) return t(`league.${draft.draw.league}`);
  if (draft.config.event) return t(`weekly.${draft.config.event}.name`);
  return null;
}

function draftLabel(t: (k: string, p?: Record<string, string | number>) => string, draft: DraftState, rival: string | null, isChallenge: boolean, practice: boolean): string | null {
  const parts: string[] = [];
  if (isChallenge) parts.push(t("draft.vsLabel", { name: (rival ?? t("draft.friend")).toUpperCase() }));
  else if (draft.config.daily) parts.push(t("mode.daily.name").toUpperCase());
  if (practice) parts.push(t("draft.practice"));
  if (draft.config.mode !== "classic" && draft.config.mode !== "daily") parts.push(t(`mode.${draft.config.mode}.name`).toUpperCase());
  const ctx = contextLabel(t, draft);
  if (ctx) parts.push(draft.draw.clubId || draft.draw.league || draft.config.event ? ctx.toUpperCase() : ctx);
  return parts.length ? parts.join(" · ") : null;
}

function cfgProps(c: DraftConfig) {
  return { mode: c.mode, formation: c.formation, seed: c.seed, daily: Boolean(c.daily) };
}
