import { useReducedMotion } from "framer-motion";

/**
 * True when entrance animations should be skipped and content shown at rest:
 * either the user prefers reduced motion, or the page is loaded with ?still=1
 * (used for static capture). Guarding `initial` on this prevents content from
 * ever being stranded at opacity:0 if the JS animation doesn't run.
 */
export function useStill(): boolean {
  const reduced = useReducedMotion();
  const still =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("still");
  return !!reduced || still;
}

/** initial-prop helper: returns `false` (no hidden state) when still. */
export function enter<T>(hidden: T, still: boolean): T | false {
  return still ? false : hidden;
}
