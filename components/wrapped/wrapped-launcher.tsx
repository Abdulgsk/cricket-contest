"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { WrappedData } from "@/services/wrapped";
import { WrappedStory } from "@/components/wrapped/wrapped-story";

export function WrappedLauncher({ data }: { data: WrappedData }) {
  const [open, setOpen] = useState(false);
  const p = data.personal;

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="group relative block w-full overflow-hidden rounded-2xl p-5 text-left text-white shadow-lg"
        style={{
          background:
            "linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--accent)) 55%, rgb(var(--warning)) 100%)",
        }}
      >
        {/* shimmer */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100"
          style={{
            background:
              "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)",
          }}
          animate={{ x: ["-120%", "120%"] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl"
        />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/80">
              <span className="text-base">🎬</span>
              {data.todayMatch
                ? data.todayMatch.isFinal
                  ? "The Final"
                  : data.todayMatch.label
                : "Season recap"}
            </div>
            <h2 className="mt-1 text-xl font-black leading-tight sm:text-2xl">
              Your GullyXI Wrapped
            </h2>
            {data.todayMatch?.winner ? (
              <p className="mt-1 text-sm font-semibold text-white/90">
                🏆 {data.todayMatch.winner}{" "}
                {data.todayMatch.isFinal ? "won the final" : "won today"}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-white/85">
              {p.persona.title} · #{p.rank} of {p.totalPlayers} ·{" "}
              {(p.totalFantasyPoints > 0
                ? p.totalFantasyPoints
                : p.totalPoints
              ).toLocaleString("en-IN")}{" "}
              {p.totalFantasyPoints > 0 ? "fp" : "pts"}
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/25 px-3 py-1.5 text-sm font-semibold backdrop-blur transition group-hover:bg-white/35">
              Play your story ▶
            </span>
          </div>
          <div className="hidden shrink-0 text-5xl sm:block">🏏</div>
        </div>
      </motion.button>

      <AnimatePresence>
        {open && <WrappedStory data={data} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
