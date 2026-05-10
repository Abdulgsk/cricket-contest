import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GullyXI — IPL League for the Squad",
  description: "Private Dream11 league management, leaderboards, predictions, bonuses & drama.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(() => {
              try {
                const t = localStorage.getItem('theme');
                if (t === 'dark') document.documentElement.classList.add('dark');
                if (t === 'light') document.documentElement.classList.remove('dark');
              } catch {}
            })();`,
          }}
        />
        {children}
        <Toaster theme="system" position="top-right" richColors />
      </body>
    </html>
  );
}
