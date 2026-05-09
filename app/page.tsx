import Link from "next/link";
import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

export default async function Landing() {
  const s = await getSession();
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between p-6 max-w-6xl mx-auto w-full">
        <Link href="/" className="font-bold text-xl tracking-tight">
          🏏 <span className="bg-gradient-to-r from-pink-400 to-sky-400 bg-clip-text text-transparent">GullyXI</span>
        </Link>
        <div className="flex items-center gap-3">
          {s ? (
            <Link href="/dashboard"><Button variant="glow" size="sm">Dashboard</Button></Link>
          ) : (
            <>
              <Link href="/login"><Button variant="ghost" size="sm">Login</Button></Link>
              <Link href="/signup"><Button variant="glow" size="sm">Join League</Button></Link>
            </>
          )}
        </div>
      </header>

      <section className="flex-1 flex flex-col items-center text-center px-6 py-12 sm:py-20 max-w-4xl mx-auto">
        <span className="text-xs font-bold tracking-[0.2em] text-primary uppercase">Private League · 13 Players</span>
        <h1 className="mt-4 text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight bg-gradient-to-br from-foreground via-primary/70 to-accent bg-clip-text text-transparent">
          Your squad&apos;s IPL command center.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl">
          Track leaderboard swings, prediction points, per-match bounty calls and special modes.
          Predictions stay editable until match start, then scoring goes full drama.
        </p>
        <div className="mt-8 sm:mt-10 flex flex-wrap justify-center gap-3 sm:gap-4">
          <Link href={s ? "/dashboard" : "/signup"}><Button variant="glow" size="lg">{s ? "Open Dashboard" : "Get Started"}</Button></Link>
          <Link href="/matches"><Button variant="outline" size="lg">Browse Matches</Button></Link>
          <Link href="/rules"><Button variant="outline" size="lg">View Rules</Button></Link>
        </div>

        <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
          {[
            ["Live", "Leaderboard"],
            ["6", "Bonus Types"],
            ["Editable", "Predictions till start"],
            ["+3", "Per-match Bounty"],
          ].map(([k, v]) => (
            <div key={v} className="glass rounded-2xl p-4">
              <div className="text-2xl font-bold text-primary">{k}</div>
              <div className="text-xs text-muted-foreground mt-1">{v}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid sm:grid-cols-3 gap-3 w-full text-left">
          <div className="glass rounded-xl p-3">
            <div className="text-sm font-semibold">⚡ Special Match Modes</div>
            <div className="text-xs text-muted-foreground mt-1">2× Points, No Bonus, Chaos and Prediction Madness.</div>
          </div>
          <div className="glass rounded-xl p-3">
            <div className="text-sm font-semibold">🎯 Per-match Bounty</div>
            <div className="text-xs text-muted-foreground mt-1">Admin can set target + reason for each match, or no bounty.</div>
          </div>
          <div className="glass rounded-xl p-3">
            <div className="text-sm font-semibold">🔒 Fair Reveal</div>
            <div className="text-xs text-muted-foreground mt-1">Predictions stay hidden from everyone until match start.</div>
          </div>
        </div>
      </section>

      <footer className="text-center text-xs text-muted-foreground py-8">
        Built for 13 friends · MongoDB · Next.js · Vercel
      </footer>
    </main>
  );
}
