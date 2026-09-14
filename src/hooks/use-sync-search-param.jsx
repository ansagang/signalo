"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Sync a value to a URL search param. Updates the URL only when the
 * serialized value differs from the current param, so it won't cause
 * router loops.
 *
 * @param {string} name - The search param name
 * @param {string} value - The serialized value ("" to remove the param)
 * @param {"push" | "replace"} mode
 */
export function useSyncSearchParam(name, value, mode = "replace") {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const current = searchParams.get(name) || "";
    if (current === value) return;

    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(name, value);
    } else {
      params.delete(name);
    }

    const qs = params.toString();
    router[mode](qs ? `${pathname}?${qs}` : pathname);
  }, [value]);
}
