/**
 * infinite_scroll.js
 *
 * Loads the next page of a list when its end scrolls into view.
 *
 * Kept generic and outside the page: Tasks is the first list to use it, but
 * Processes, Decisions, Deployments and Batches paginate the same way and can
 * adopt it without copying the observer.
 */
import { useEffect, useRef } from "preact/hooks";

/**
 * Observe a sentinel element and call `load_more` while it is in view.
 *
 * `enabled` carries both conditions the caller cares about — there is another
 * page, and no request is in flight. Disabling tears the observer down, which
 * *is* the in-flight guard: no second call can be made while one is running.
 * Re-enabling builds a fresh observer, which fires again straight away if the
 * sentinel is still visible. That is what keeps a short page loading until the
 * viewport is full, since IntersectionObserver reports changes, not states, and
 * would otherwise stay silent after the first page.
 *
 * @param load_more {() => void}
 * @param enabled   {boolean}   there is more to load and nothing is loading
 * @param root_margin {string}  how early to fetch, ahead of the true end
 * @returns {import("preact").RefObject} ref to put on the sentinel element
 */
/* eslint-disable react-hooks/rules-of-hooks --
   Same reason as in plugin_api.jsx: this is a custom hook, but the project
   names functions in snake_case, which the rule's `useCamelCase` heuristic
   cannot recognise. */
export const use_infinite_scroll = (
  load_more,
  { enabled = true, root_margin = "200px" } = {},
) => {
  const sentinel = useRef(null),
    // Read at fire time, so a changed callback needs no new observer.
    latest = useRef(load_more);
  latest.current = load_more;

  useEffect(() => {
    const element = sentinel.current;
    // No observer in this environment: the caller's load-more button stays the
    // way through, so the list is never stuck.
    if (!element || !enabled || typeof IntersectionObserver !== "function")
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) latest.current?.();
      },
      { rootMargin: root_margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, root_margin]);

  return sentinel;
};
