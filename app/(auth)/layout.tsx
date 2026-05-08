import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link href="/" className="block text-center font-bold text-xl mb-6">
          🏏 <span className="bg-gradient-to-r from-pink-400 to-sky-400 bg-clip-text text-transparent">Fantasy 13</span>
        </Link>
        <div className="glass rounded-2xl p-6">{children}</div>
      </div>
    </main>
  );
}
