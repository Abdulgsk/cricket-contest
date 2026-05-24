"use client";

import * as React from "react";

/**
 * Returns the user's locale-formatted timestamp, but only after the
 * component has mounted. During SSR we return `undefined` so the server
 * and client HTML always match. Use for `title=` tooltips that don't
 * need to be present in the initial paint.
 */
export function useLocaleTitle(iso: string | Date | number | null | undefined): string | undefined {
  const [val, setVal] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    if (!iso) {
      setVal(undefined);
      return;
    }
    try {
      setVal(new Date(iso).toLocaleString());
    } catch {
      setVal(undefined);
    }
  }, [iso]);
  return val;
}
