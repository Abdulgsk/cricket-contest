import { requireUser } from "@/lib/rbac";
import { Nav } from "@/components/nav";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/models/Settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  await connectDB();
  const settings = await getSettings();
  return (
    <div className="flex flex-1 min-h-screen">
      <Nav role={me.role} />
      <div className="flex-1 flex flex-col pb-20 md:pb-0">
        {settings.announcement ? (
          <div className="m-3 md:m-4 glass rounded-xl px-4 py-2 text-sm text-pink-300">
            📣 {settings.announcement}
          </div>
        ) : null}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
