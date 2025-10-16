"use client";

import { useEffect, useState } from "react";

/**
 * useResponsiveLayout
 * - layoutMode: 'compact' on narrow (<=768px) or short (<=700px) viewports, else 'desktop'
 * - isCoarsePointer: true for touch-first devices (e.g., phones/tablets)
 */
export function useResponsiveLayout() {
  const [isNarrow, setIsNarrow] = useState(false);
  const [isShort, setIsShort] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mqNarrow = window.matchMedia("(max-width: 768px)");
    const mqShort = window.matchMedia("(max-height: 700px)");
    const mqCoarse = window.matchMedia("(pointer: coarse)");

    const update = () => {
      setIsNarrow(!!mqNarrow.matches);
      setIsShort(!!mqShort.matches);
      setIsCoarsePointer(!!mqCoarse.matches);
    };

    update();

    mqNarrow.addEventListener("change", update);
    mqShort.addEventListener("change", update);
    mqCoarse.addEventListener("change", update);
    return () => {
      mqNarrow.removeEventListener("change", update);
      mqShort.removeEventListener("change", update);
      mqCoarse.removeEventListener("change", update);
    };
  }, []);

  const layoutMode = (isNarrow || isShort) ? "compact" : "desktop";
  return { layoutMode, isCoarsePointer };
}


