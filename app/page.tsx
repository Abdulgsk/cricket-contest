import Link from "next/link";
import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

export default async function Landing() {
  const s = await getSession();
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between p-6 max-w-6xl mx-auto w-full">
        <Link href="/" className="font-bold text-xl tracking-tight">
          🏏 <span className="bg-gradient-to-r from-pink-400 to-sky-400 bg-clip-text text-transparent">Fantasy 13</span>
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

      <section className="flex-1 flex flex-col items-center text-center px-6 py-20 max-w-4xl mx-auto">
        <span className="text-xs font-bold tracking-[0.2em] text-pink-400 uppercase">Private League · 13 Players</span>
        <h1 className="mt-4 text-5xl md:text-7xl font-extrabold tracking-tight bg-gradient-to-br from-white via-pink-200 to-sky-300 bg-clip-text text-transparent">
          The unofficial Dream11 league HQ.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
          Track ranks, bonuses, penalties and drama after every IPL match. Lock predictions in
          suspense. Crown the champion of 13.
        </p>
        <div className="mt-10 flex gap-4">
          <Link href="/signup"><Button variant="glow" size="lg">Get Started</Button></Link>
          <Link href="/rules"><Button variant="outline" size="lg">View Rules</Button></Link>
        </div>

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
          {[
            ["Live", "Leaderboard"],
            ["6", "Bonus Types"],
            ["Locked", "Predictions"],
            ["Auto", "WhatsApp Reminders"],
          ].map(([k, v]) => (
            <div key={v} className="glass rounded-2xl p-4">
              <div className="text-2xl font-bold text-pink-400">{k}</div>
              <div className="text-xs text-muted-foreground mt-1">{v}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center text-xs text-muted-foreground py-8">
        Built for 13 friends · MongoDB · Next.js · Vercel
      </footer>
    </main>
  );
}
