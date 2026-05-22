import Link from "next/link";
import { Card } from "@/components/ui/card";
import { FEATURE_BY_KEY, type FeatureKey } from "@/lib/features";

/**
 * Inline "you don't have permission" placeholder. Use this from server
 * components to wrap a section that the current user can't see, instead of
 * redirecting away from the page entirely.
 *
 * Example:
 *   {userCan(me, "results.manage")
 *     ? <ResultEntryForm ... />
 *     : <NoAccessCard feature="results.manage" />}
 */
export function NoAccessCard({
  feature,
  anyOf,
  title = "Restricted section",
  hint,
}: {
  feature?: FeatureKey;
  anyOf?: FeatureKey[];
  title?: string;
  hint?: string;
}) {
  const required = anyOf ?? (feature ? [feature] : []);
  const labels = required.map((f) => FEATURE_BY_KEY[f]?.label ?? f);

  return (
    <Card className="border-dashed border-border/60 bg-muted/20">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 size-8 rounded-full bg-muted/60 grid place-items-center text-muted-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden
          >
            <rect width="18" height="11" x="3" y="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {hint ??
              (labels.length === 0
                ? "You don't have permission to view this section."
                : labels.length === 1
                  ? `Requires the "${labels[0]}" permission.`
                  : `Requires one of: ${labels.map((l) => `"${l}"`).join(", ")}.`)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            Ask a superadmin to grant access in{" "}
            <Link href="/admin/users" className="underline hover:text-foreground">
              Users → Permissions
            </Link>
            .
          </p>
        </div>
      </div>
    </Card>
  );
}
