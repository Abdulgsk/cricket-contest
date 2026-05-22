"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FeatureKey } from "@/lib/features";

/**
 * Permissions context. Populated once by the admin layout from the server-
 * resolved user object, then consumed by any client component that wants to
 * toggle UI based on the current user's effective features.
 *
 * Keeping this in a context means client widgets never need to call a server
 * action just to ask "can I render this button?".
 */
type Ctx = {
  features: ReadonlySet<FeatureKey>;
  isSuperadmin: boolean;
};

const PermissionsContext = createContext<Ctx>({
  features: new Set(),
  isSuperadmin: false,
});

export function PermissionsProvider({
  features,
  isSuperadmin,
  children,
}: {
  features: readonly FeatureKey[];
  isSuperadmin: boolean;
  children: ReactNode;
}) {
  return (
    <PermissionsContext.Provider value={{ features: new Set(features), isSuperadmin }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function useCan(feature: FeatureKey): boolean {
  const { features, isSuperadmin } = useContext(PermissionsContext);
  if (isSuperadmin) return true;
  return features.has(feature);
}

export function useCanAny(features: readonly FeatureKey[]): boolean {
  const ctx = useContext(PermissionsContext);
  if (ctx.isSuperadmin) return true;
  return features.some((f) => ctx.features.has(f));
}

export function useIsSuperadmin(): boolean {
  return useContext(PermissionsContext).isSuperadmin;
}

/**
 * Conditionally render children when the current user has the feature.
 * Use this for buttons / sections inside client components.
 */
export function Gate({
  feature,
  anyOf,
  fallback = null,
  children,
}: {
  feature?: FeatureKey;
  anyOf?: readonly FeatureKey[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const ctx = useContext(PermissionsContext);
  if (ctx.isSuperadmin) return <>{children}</>;
  if (feature && !ctx.features.has(feature)) return <>{fallback}</>;
  if (anyOf && !anyOf.some((f) => ctx.features.has(f))) return <>{fallback}</>;
  return <>{children}</>;
}
