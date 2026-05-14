import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <BrandLogo size="xl" clickable />
        </div>
        <div className="glass rounded-2xl p-6">{children}</div>
      </div>
    </main>
  );
}
