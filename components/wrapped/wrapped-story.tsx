"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  useTransform,
  type Variants,
} from "framer-motion";
import type { WrappedData } from "@/services/wrapped";

// --- Count-up number -------------------------------------------------------

function CountUp({
  to,
  duration = 1.4,
  className,
}: {
  to: number;
  duration?: number;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) =>
    Math.round(v).toLocaleString("en-IN"),
  );
  useEffect(() => {
    const controls = animate(mv, to, { duration, ease: [0.16, 1, 0.3, 1] });
    return controls.stop;
  }, [mv, to, duration]);
  return <motion.span className={className}>{rounded}</motion.span>;
}

// --- Slide chrome ----------------------------------------------------------

type Grad = [string, string];

const G = {
  violet: ["var(--primary)", "var(--accent)"] as Grad,
  sunset: ["var(--warning)", "var(--danger)"] as Grad,
  emerald: ["var(--success)", "var(--primary)"] as Grad,
  gold: ["var(--warning)", "var(--accent)"] as Grad,
  crimson: ["var(--danger)", "var(--primary)"] as Grad,
};

function grad([a, b]: Grad) {
  return `linear-gradient(150deg, rgb(${a}) 0%, rgb(${b}) 100%)`;
}

const rise: Variants = {
  initial: { opacity: 0, y: 28, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
};
const pop: Variants = {
  initial: { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1 },
};

function Stagger({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      transition={{ staggerChildren: 0.12, delayChildren: delay }}
      className="flex flex-col items-center text-center gap-3"
    >
      {children}
    </motion.div>
  );
}

function Line({
  children,
  className = "",
  variant = rise,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: Variants;
}) {
  return (
    <motion.div
      variants={variant}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Floating decorative blobs for depth.
function Blobs() {
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full bg-white/20 blur-3xl"
        animate={{ y: [0, 24, 0], x: [0, 16, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-black/15 blur-3xl"
        animate={{ y: [0, -28, 0], x: [0, -18, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

// --- Initials avatar (no network dep) --------------------------------------

function Initials({ name, size = 72 }: { name: string; size?: number }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <div
      className="flex items-center justify-center rounded-full bg-white/25 font-black text-white ring-4 ring-white/40 backdrop-blur"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

// --- Slides ----------------------------------------------------------------

type Slide = {
  gradient: Grad;
  /** seconds */
  duration: number;
  render: (d: WrappedData) => React.ReactNode;
};

function buildSlides(d: WrappedData): Slide[] {
  const p = d.personal;
  const slides: Slide[] = [];

  // 0 — Intro
  slides.push({
    gradient: G.violet,
    duration: 4,
    render: () => (
      <Stagger>
        <Line variant={pop}>
          <div className="text-6xl">🏏</div>
        </Line>
        <Line className="text-sm font-semibold uppercase tracking-[0.3em] text-white/80">
          GullyXI presents
        </Line>
        <Line className="text-4xl font-black leading-tight text-white sm:text-5xl">
          Your Season,
          <br />
          Wrapped
        </Line>
        <Line className="text-base text-white/80">{d.season}</Line>
        <Line className="mt-2 text-xs text-white/60">tap to begin →</Line>
      </Stagger>
    ),
  });

  // 0b — Today's match result (the cricket team that won)
  if (d.todayMatch) {
    const t = d.todayMatch;
    slides.push({
      gradient: G.gold,
      duration: 6,
      render: () => (
        <Stagger>
          <Line className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
            {t.isFinal ? "The Final 🏆" : "Today on the pitch"}
          </Line>
          <Line variant={pop}>
            <div className="flex items-center justify-center gap-3 text-4xl font-black text-white sm:text-5xl">
              <span className={t.winner === t.teamA ? "" : "text-white/50"}>
                {t.teamAShort}
              </span>
              <span className="text-lg font-semibold text-white/70">vs</span>
              <span className={t.winner === t.teamB ? "" : "text-white/50"}>
                {t.teamBShort}
              </span>
            </div>
          </Line>
          {t.winner ? (
            <>
              <Line className="mt-1 text-base text-white/85">
                {t.isFinal ? "🏆 Champions" : "🏆 Winners"}
              </Line>
              <Line variant={pop}>
                <div className="text-2xl font-black leading-tight text-white sm:text-3xl">
                  {t.winner}
                </div>
              </Line>
              {t.isFinal && (
                <Line className="text-sm font-semibold text-white/85">
                  Season {d.season.replace(/^Season\s*/, "")} champions 🎉
                </Line>
              )}
            </>
          ) : (
            <Line className="text-lg font-bold text-white">
              {t.isFinal ? "The final is wrapped 🏁" : "Match wrapped up 🏁"}
            </Line>
          )}
          {t.scoreSummary && (
            <Line className="mt-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-medium text-white backdrop-blur">
              {t.scoreSummary}
            </Line>
          )}
        </Stagger>
      ),
    });
  }

  // 1 — League by the numbers
  slides.push({
    gradient: G.emerald,
    duration: 5,
    render: () => (
      <Stagger>
        <Line className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
          The league this season
        </Line>
        <Line variant={pop}>
          <div className="text-7xl font-black text-white">
            <CountUp to={d.league.matchesScored} />
          </div>
        </Line>
        <Line className="text-lg text-white/85">matches battled out</Line>
        <Line className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/15 px-5 py-3 backdrop-blur">
            <div className="text-2xl font-black text-white">
              <CountUp to={d.league.players} />
            </div>
            <div className="text-xs text-white/70">players</div>
          </div>
          <div className="rounded-2xl bg-white/15 px-5 py-3 backdrop-blur">
            <div className="text-2xl font-black text-white">
              <CountUp to={d.league.totalFantasyPoints} />
            </div>
            <div className="text-xs text-white/70">fantasy points</div>
          </div>
        </Line>
        {d.league.highestSingleScore && (
          <Line className="mt-1 rounded-full bg-white/20 px-4 py-1.5 text-sm font-medium text-white backdrop-blur">
            💥 Biggest haul: {d.league.highestSingleScore.points} fp by{" "}
            {d.league.highestSingleScore.name}
          </Line>
        )}
      </Stagger>
    ),
  });

  // 2 — Your matches
  slides.push({
    gradient: G.sunset,
    duration: 4.5,
    render: () => (
      <Stagger>
        <Line variant={pop}>
          {p.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.avatar}
              alt=""
              className="h-20 w-20 rounded-full object-cover ring-4 ring-white/40"
            />
          ) : (
            <Initials name={p.username} size={80} />
          )}
        </Line>
        <Line className="text-2xl font-bold text-white">
          Alright, {p.username.split(/\s+/)[0]} 👋
        </Line>
        <Line className="text-white/85">You showed up for</Line>
        <Line variant={pop}>
          <div className="text-7xl font-black text-white">
            <CountUp to={p.matches} />
          </div>
        </Line>
        <Line className="text-lg text-white/85">scored matches</Line>
      </Stagger>
    ),
  });

  // 3 — Total points
  slides.push({
    gradient: G.violet,
    duration: 7,
    render: () => (
      <Stagger>
        <Line className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
          You racked up
        </Line>
        <Line variant={pop}>
          <div className="text-6xl font-black leading-none text-white sm:text-7xl">
            <CountUp to={p.totalPoints} duration={2} />
          </div>
        </Line>
        <Line className="text-lg font-semibold text-white/90">
          total league points
        </Line>
        {p.pointsBreakdown.length > 0 ? (
          <Line className="mt-2 w-full max-w-xs">
            <div className="rounded-2xl bg-white/15 px-3 py-2 backdrop-blur">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-white/70">
                How it adds up
              </div>
              <div className="space-y-1">
                {p.pointsBreakdown.map((b) => (
                  <div
                    key={b.label}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex items-center gap-1.5 text-white/90">
                      <span>{b.emoji}</span>
                      {b.label}
                    </span>
                    <span
                      className={
                        "font-bold tabular-nums " +
                        (b.points < 0 ? "text-white/70" : "text-white")
                      }
                    >
                      {b.points > 0 ? "+" : ""}
                      {b.points.toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Line>
        ) : null}
        {p.totalPlayers > 1 && (
          <Line className="rounded-full bg-white/20 px-4 py-1.5 text-xs font-medium text-white backdrop-blur">
            Top {Math.max(1, 100 - p.percentile)}% of the league 🚀
          </Line>
        )}
      </Stagger>
    ),
  });

  // 3b — Total fantasy points (the my11/Dream11 grind)
  if (p.totalFantasyPoints > 0) {
    slides.push({
      gradient: G.emerald,
      duration: 5.5,
      render: () => (
        <Stagger>
          <Line className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
            Across {p.matches} matches, you scored
          </Line>
          <Line variant={pop}>
            <div className="text-7xl font-black leading-none text-white sm:text-8xl">
              <CountUp to={p.totalFantasyPoints} duration={2.2} />
            </div>
          </Line>
          <Line className="text-xl font-semibold text-white/90">
            fantasy points 🪙
          </Line>
          <Line className="mt-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-medium text-white backdrop-blur">
            That&apos;s {p.avgFantasyPoints} per match on average
          </Line>
        </Stagger>
      ),
    });
  }

  // 3c — Best single match
  if (p.bestMatch && p.bestMatch.points > 0) {
    slides.push({
      gradient: G.sunset,
      duration: 5,
      render: () => (
        <Stagger>
          <Line className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
            Your magnum opus
          </Line>
          <Line variant={pop}>
            <div className="text-7xl font-black text-white">
              <CountUp to={p.bestMatch!.points} duration={1.8} />
            </div>
          </Line>
          <Line className="text-lg text-white/90">
            fantasy points in a single match 🚀
          </Line>
          <Line className="mt-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur">
            {p.bestMatch!.label}
          </Line>
          {p.bestRank && (
            <Line className="text-sm text-white/80">
              Best finish: #{p.bestRank} 🏅
            </Line>
          )}
        </Stagger>
      ),
    });
  }

  // 3d — Predictions
  if (p.predictions.total > 0) {
    slides.push({
      gradient: G.violet,
      duration: 6,
      render: () => (
        <Stagger>
          <Line className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
            The crystal ball
          </Line>
          <Line variant={pop}>
            <div className="text-7xl font-black text-white">
              <CountUp to={p.predictions.accuracy} duration={1.6} />%
            </div>
          </Line>
          <Line className="text-lg text-white/90">prediction accuracy</Line>
          <Line className="mt-2 grid grid-cols-3 gap-2 text-center">
            {[
              { e: "🏆", n: p.predictions.correctWinners, l: "winners" },
              { e: "🏏", n: p.predictions.correctBatters, l: "batters" },
              { e: "🎯", n: p.predictions.correctBowlers, l: "bowlers" },
            ].map((m, i) => (
              <motion.div
                key={m.l}
                variants={pop}
                transition={{ delay: i * 0.12, type: "spring", bounce: 0.4 }}
                className="rounded-2xl bg-white/15 px-3 py-2 backdrop-blur"
              >
                <div className="text-xl">{m.e}</div>
                <div className="text-lg font-black text-white">{m.n}</div>
                <div className="text-[10px] text-white/70">{m.l}</div>
              </motion.div>
            ))}
          </Line>
          {p.predictions.perfects > 0 && (
            <Line className="text-sm text-white/85">
              {p.predictions.perfects} perfect round
              {p.predictions.perfects === 1 ? "" : "s"} — all three right 🧠
            </Line>
          )}
        </Stagger>
      ),
    });
  }

  // 3e — Head-to-heads (rivalry + civil war)
  if (
    p.rivalry.wins + p.rivalry.losses + p.rivalry.draws > 0 ||
    p.civilWar.wins + p.civilWar.losses + p.civilWar.draws > 0
  ) {
    slides.push({
      gradient: G.crimson,
      duration: 6,
      render: () => (
        <Stagger>
          <Line className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
            Battles fought
          </Line>
          <Line variant={pop}>
            <div className="text-5xl">🤺</div>
          </Line>
          <Line className="w-full max-w-xs space-y-2">
            {p.rivalry.wins + p.rivalry.losses + p.rivalry.draws > 0 && (
              <div className="rounded-2xl bg-white/15 px-4 py-2 backdrop-blur">
                <div className="text-xs text-white/70">Rivalries</div>
                <div className="text-lg font-black text-white">
                  {p.rivalry.wins}W · {p.rivalry.losses}L · {p.rivalry.draws}D
                </div>
              </div>
            )}
            {p.civilWar.wins + p.civilWar.losses + p.civilWar.draws > 0 && (
              <div className="rounded-2xl bg-white/15 px-4 py-2 backdrop-blur">
                <div className="text-xs text-white/70">Civil War ⚔️</div>
                <div className="text-lg font-black text-white">
                  {p.civilWar.wins}W · {p.civilWar.losses}L · {p.civilWar.draws}D
                </div>
              </div>
            )}
          </Line>
          <Line className="text-sm text-white/85">
            {p.rivalry.wins + p.civilWar.wins >=
            p.rivalry.losses + p.civilWar.losses
              ? "More wins than scars. A fighter. 🔥"
              : "Bruised but never broken. 💪"}
          </Line>
        </Stagger>
      ),
    });
  }

  // 3f — Flavour: favourite team & bonus
  if (p.favouriteTeam || p.favouriteBonus) {
    slides.push({
      gradient: G.gold,
      duration: 5,
      render: () => (
        <Stagger>
          <Line className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
            Little habits
          </Line>
          {p.favouriteTeam && (
            <Line variant={pop} className="w-full max-w-xs">
              <div className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur">
                <div className="text-xs text-white/70">
                  Team you backed most
                </div>
                <div className="text-xl font-black text-white">
                  {p.favouriteTeam.name}
                </div>
                <div className="text-xs text-white/70">
                  {p.favouriteTeam.count} prediction
                  {p.favouriteTeam.count === 1 ? "" : "s"}
                </div>
              </div>
            </Line>
          )}
          {p.favouriteBonus && (
            <Line variant={pop} className="w-full max-w-xs">
              <div className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur">
                <div className="text-xs text-white/70">Signature bonus</div>
                <div className="text-xl font-black text-white">
                  {p.favouriteBonus.label}
                </div>
                <div className="text-xs text-white/70">
                  earned {p.favouriteBonus.count}×
                </div>
              </div>
            </Line>
          )}
        </Stagger>
      ),
    });
  }

  // 4 — Rank
  slides.push({
    gradient: G.gold,
    duration: 5,
    render: () => (
      <Stagger>
        <Line className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
          Where you stand
        </Line>
        <Line variant={pop}>
          <div className="flex items-end justify-center gap-1 text-white">
            <span className="text-3xl font-bold">#</span>
            <span className="text-8xl font-black leading-none">
              <CountUp to={p.rank} duration={1.6} />
            </span>
          </div>
        </Line>
        <Line className="text-lg text-white/90">
          out of {p.totalPlayers} players
        </Line>
        <Line className="mt-2 text-white/80">
          {p.rank === 1
            ? "Nobody did it better. 👑"
            : p.rank <= 3
              ? "On the podium where legends sit. 🏆"
              : "And the climb continues. 📈"}
        </Line>
      </Stagger>
    ),
  });

  // 5 — Medals (only if any podiums)
  if (p.podiums > 0) {
    slides.push({
      gradient: G.crimson,
      duration: 5,
      render: () => (
        <Stagger>
          <Line className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
            Your trophy cabinet
          </Line>
          <Line className="mt-2 flex items-end justify-center gap-4">
            {[
              { e: "🥇", n: p.wins },
              { e: "🥈", n: p.silver },
              { e: "🥉", n: p.bronze },
            ].map((m, i) => (
              <motion.div
                key={m.e}
                variants={pop}
                transition={{ delay: i * 0.15, type: "spring", bounce: 0.5 }}
                className="flex flex-col items-center"
              >
                <div className="text-5xl">{m.e}</div>
                <div className="mt-1 text-3xl font-black text-white">
                  {m.n}
                </div>
              </motion.div>
            ))}
          </Line>
          <Line className="mt-4 text-lg text-white/90">
            {p.podiums} podium finish{p.podiums === 1 ? "" : "es"} 🔥
          </Line>
        </Stagger>
      ),
    });
  }

  // 6 — Top category
  if (p.topCategory) {
    slides.push({
      gradient: G.emerald,
      duration: 5,
      render: () => (
        <Stagger>
          <Line className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
            Your signature move
          </Line>
          <Line variant={pop}>
            <div className="text-5xl font-black text-white">
              {p.topCategory!.label}
            </div>
          </Line>
          <Line className="text-white/85">earned you</Line>
          <Line variant={pop}>
            <div className="text-6xl font-black text-white">
              <CountUp to={p.topCategory!.points} />
            </div>
          </Line>
          <Line className="text-lg text-white/85">points — your best bag</Line>
        </Stagger>
      ),
    });
  }

  // 7 — Persona
  slides.push({
    gradient: G.violet,
    duration: 5.5,
    render: () => (
      <Stagger>
        <Line className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
          This season, you were
        </Line>
        <Line variant={pop}>
          <div className="text-4xl font-black leading-tight text-white sm:text-5xl">
            {p.persona.title}
          </div>
        </Line>
        <Line className="max-w-xs text-base text-white/90">
          {p.persona.blurb}
        </Line>
        {p.crowns.length > 0 && (
          <Line className="mt-3 flex flex-wrap justify-center gap-2">
            {p.crowns.map((c) => (
              <span
                key={c}
                className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur"
              >
                {c}
              </span>
            ))}
          </Line>
        )}
      </Stagger>
    ),
  });

  // 8 — Hall of Fame (league superlatives)
  slides.push({
    gradient: G.gold,
    duration: 9,
    render: () => (
      <motion.div
        initial="initial"
        animate="animate"
        transition={{ staggerChildren: 0.08 }}
        className="flex max-h-[82dvh] w-full max-w-sm flex-col items-center gap-2"
      >
        <Line className="shrink-0 text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
          🏅 Hall of Fame
        </Line>
        <Line className="-mt-1 shrink-0 text-[11px] text-white/70">
          who topped each category & how it&apos;s measured
        </Line>
        <div className="mt-1 w-full flex-1 space-y-1.5 overflow-y-auto pb-2 pr-1 [pointer-events:auto] [-webkit-overflow-scrolling:touch]">
          {d.superlatives.map((s) => (
            <motion.div
              key={s.key}
              variants={rise}
              transition={{ duration: 0.5 }}
              className={
                "rounded-2xl px-3 py-2 backdrop-blur " +
                (s.isMe ? "bg-white/35 ring-2 ring-white/60" : "bg-white/15")
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div className="truncate text-xs font-semibold text-white/85">
                  {s.title}
                </div>
                <div className="shrink-0 text-sm font-black text-white">
                  {s.value}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="truncate text-sm font-bold text-white">
                  {s.winner}
                  {s.isMe && " (you!)"}
                </div>
              </div>
              <div className="mt-0.5 text-[10px] leading-snug text-white/65">
                {s.blurb}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    ),
  });

  // 9 — Outro
  slides.push({
    gradient: G.crimson,
    duration: 6,
    render: () => (
      <Stagger>
        <Line variant={pop}>
          <div className="text-6xl">🎉</div>
        </Line>
        <Line className="text-3xl font-black text-white">
          That&apos;s a wrap!
        </Line>
        <Line className="max-w-xs text-white/90">
          {p.rank === 1
            ? "Champion of the season. Defend the crown."
            : "The next match could rewrite everything. See you on the pitch."}
        </Line>
        <Line className="mt-3 text-xs uppercase tracking-[0.3em] text-white/70">
          GullyXI · {d.season}
        </Line>
      </Stagger>
    ),
  });

  return slides;
}

// --- Story shell -----------------------------------------------------------

export function WrappedStory({
  data,
  onClose,
}: {
  data: WrappedData;
  onClose: () => void;
}) {
  const slides = useMemo(() => buildSlides(data), [data]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);

  const slide = slides[index];
  const durationMs = slide.duration * 1000;

  const go = useCallback(
    (next: number) => {
      if (next < 0) return;
      if (next >= slides.length) {
        onClose();
        return;
      }
      setIndex(next);
      setProgress(0);
      elapsedRef.current = 0;
      startRef.current = 0;
    },
    [slides.length, onClose],
  );

  // Auto-advance loop.
  useEffect(() => {
    if (paused) return;
    let active = true;
    const tick = (now: number) => {
      if (!active) return;
      if (!startRef.current) startRef.current = now - elapsedRef.current;
      const elapsed = now - startRef.current;
      elapsedRef.current = elapsed;
      const pct = Math.min(1, elapsed / durationMs);
      setProgress(pct);
      if (pct >= 1) {
        go(index + 1);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [index, paused, durationMs, go]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-0 sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
        className="relative h-full w-full overflow-hidden sm:h-[88vh] sm:max-h-[760px] sm:w-[420px] sm:rounded-[2rem] sm:shadow-2xl"
      >
        {/* Animated gradient background */}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={index}
            className="absolute inset-0"
            style={{ background: grad(slide.gradient) }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        </AnimatePresence>
        <Blobs />

        {/* Progress segments */}
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 p-3">
          {slides.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
            >
              <div
                className="h-full rounded-full bg-white"
                style={{
                  width:
                    i < index
                      ? "100%"
                      : i === index
                        ? `${progress * 100}%`
                        : "0%",
                  transition: i === index ? "none" : "width 0.2s linear",
                }}
              />
            </div>
          ))}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-6 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30"
        >
          ✕
        </button>

        {/* Tap zones */}
        <button
          aria-label="Previous"
          className="absolute inset-y-0 left-0 z-10 w-1/3"
          onClick={() => go(index - 1)}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        />
        <button
          aria-label="Next"
          className="absolute inset-y-0 right-0 z-10 w-2/3"
          onClick={() => go(index + 1)}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        />

        {/* Slide content (pointer-events-none so taps reach the zones below) */}
        <div className="pointer-events-none relative z-10 flex h-full w-full items-center justify-center px-7">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="flex h-full w-full items-center justify-center"
            >
              {slide.render(data)}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
