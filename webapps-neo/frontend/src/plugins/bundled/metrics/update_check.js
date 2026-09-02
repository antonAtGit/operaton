/**
 * update_check.js
 *
 * Compares the running engine version against the latest published release of
 * operaton/operaton on GitHub, so an operator sees on the metrics page that an
 * update exists.
 *
 * Off unless the operator opts in (`updateCheck` in config.json): this is an
 * outbound request to github.com, and not every installation wants its web app
 * talking to the internet.
 *
 * Every failure is silent — offline, an air-gapped network, GitHub's rate limit
 * (60 unauthenticated calls per hour and IP) or an unparsable tag all simply
 * mean no badge is rendered. The metrics page must never depend on this.
 */
import { get_config } from "../../../config.js";

const RELEASE_URL =
  "https://api.github.com/repos/operaton/operaton/releases/latest";
const CACHE_KEY = "operaton.latest-release";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// "v2.1.4" / "2.2.0-SNAPSHOT" → [2, 1, 4]. A pre-release suffix is dropped, so
// a 2.2.0-SNAPSHOT engine counts as 2.2.0 and is never flagged against 2.1.4.
export const parse_version = (value) => {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(value ?? "").trim());
  return match ? [+match[1], +match[2], +(match[3] ?? 0)] : null;
};

// True only when `latest` is provably newer. Anything unparsable answers false,
// because claiming an update that may not exist is worse than staying quiet.
export const is_outdated = (current, latest) => {
  const a = parse_version(current),
    b = parse_version(latest);
  if (!a || !b) return false;
  for (let i = 0; i < a.length; i++) {
    if (b[i] !== a[i]) return b[i] > a[i];
  }
  return false;
};

// localStorage throws in some privacy modes, so both sides stay guarded.
const from_cache = () => {
  try {
    const { tag, at } = JSON.parse(localStorage.getItem(CACHE_KEY));
    return Date.now() - at < CACHE_TTL_MS ? tag : null;
  } catch {
    return null;
  }
};

const to_cache = (tag) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ tag, at: Date.now() }));
  } catch {
    /* cache is a nicety, not a requirement */
  }
};

/**
 * Latest release tag, or null when disabled/unavailable. Cached for a day so a
 * browser costs GitHub one call per day rather than one per page view.
 */
export const latest_release = async (signal) => {
  if (!get_config().update_check) return null;

  const hit = from_cache();
  if (hit) return hit;

  try {
    const response = await fetch(RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal,
    });
    if (!response.ok) return null;
    const tag = (await response.json()).tag_name;
    if (!parse_version(tag)) return null;
    to_cache(tag);
    return tag;
  } catch {
    return null;
  }
};
