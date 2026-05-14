import Link from "next/link";
import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";

export default async function Landing() {
  const s = await getSession();
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between p-6 max-w-6xl mx-auto w-full">
        <Link href="/" className="inline-block">
          <BrandLogo size="lg" />
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

        <div className="mt-14 w-full">
          <div className="glass relative overflow-hidden rounded-3xl p-6 sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl"
            />
            <div className="relative grid gap-6 sm:grid-cols-2 sm:items-center">
              <div className="text-left">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-semibold text-primary">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  Season Live
                </div>
                <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Predict. Battle.{" "}
                  <span
                    className="bg-clip-text text-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--accent)) 100%)",
                    }}
                  >
                    Banter.
                  </span>
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Lock in your call before toss. Pick a rival. Watch the leaderboard flip after every match.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-background/60 p-3 ring-1 ring-border/60">
                  <div className="text-xl font-bold text-primary">+3</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Win a rivalry</div>
                </div>
                <div className="rounded-2xl bg-background/60 p-3 ring-1 ring-border/60">
                  <div className="text-xl font-bold text-accent">2×</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Special match modes</div>
                </div>
                <div className="rounded-2xl bg-background/60 p-3 ring-1 ring-border/60">
                  <div className="text-xl font-bold text-warning">🎯</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Per-match bounty</div>
                </div>
                <div className="rounded-2xl bg-background/60 p-3 ring-1 ring-border/60">
                  <div className="text-xl font-bold text-success">🔒</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Fair reveal at toss</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
