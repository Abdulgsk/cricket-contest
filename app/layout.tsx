import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeInit } from "@/components/theme-init";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GullyXI — IPL League for the Squad",
  description: "Private Dream11 league management, leaderboards, predictions, bonuses & drama.",
};

export const viewport: Viewport = {
  // Prevent iOS Safari from auto-zooming when focusing inputs/selects.
  // Keeping `maximum-scale: 1` here is intentional — the league app is a
  // tightly-designed dashboard, not long-form reading; users can still pinch
  // to zoom in browsers that ignore this hint.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Inline script: applies the saved theme class before first paint to avoid
  // a flash of the wrong colours. Mirrors the logic in components/theme-init.
  const themeBootScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='wine')t='ink';if(t==='light')t='sand';var ok={sand:1,paper:1,mist:1,halo:1,ink:1};if(!ok[t])t='sand';var r=document.documentElement;r.classList.remove('theme-sand','theme-paper','theme-mist','theme-halo','theme-ink','theme-wine');r.classList.add('theme-'+t);r.classList.toggle('dark',t==='ink');}catch(e){}})();`;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeInit />
        {children}
        <Toaster theme="system" position="top-right" richColors />
        <SpeedInsights />
      </body>
    </html>
  );
}
