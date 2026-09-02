import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parse_version, is_outdated, latest_release } from "./update_check.js";
import { get_config } from "../../../config.js";

vi.mock("../../../config.js", () => ({ get_config: vi.fn() }));

const enabled = (on) => get_config.mockReturnValue({ update_check: on });
const respond = (body, ok = true) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, json: async () => body }),
  );

beforeEach(() => {
  localStorage.clear();
  enabled(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parse_version", () => {
  it("reads a plain, a v-prefixed and a pre-release version", () => {
    expect(parse_version("2.1.4")).toEqual([2, 1, 4]);
    expect(parse_version("v2.1.4")).toEqual([2, 1, 4]);
    expect(parse_version("2.2.0-SNAPSHOT")).toEqual([2, 2, 0]);
    expect(parse_version("2.2")).toEqual([2, 2, 0]);
  });

  it("returns null for anything it cannot read", () => {
    for (const value of ["", "next", undefined, null, {}])
      expect(parse_version(value)).toBeNull();
  });
});

describe("is_outdated", () => {
  it("compares major, minor and patch in order", () => {
    expect(is_outdated("2.1.4", "v2.1.5")).toBe(true);
    expect(is_outdated("2.1.4", "v2.2.0")).toBe(true);
    expect(is_outdated("2.1.4", "v3.0.0")).toBe(true);
    expect(is_outdated("2.1.4", "v2.1.4")).toBe(false);
    expect(is_outdated("2.9.0", "v2.10.0")).toBe(true);
  });

  it("never flags an engine that is ahead of the last release", () => {
    expect(is_outdated("2.2.0-SNAPSHOT", "v2.1.4")).toBe(false);
  });

  it("stays quiet when either side is unparsable", () => {
    expect(is_outdated("unknown", "v2.1.4")).toBe(false);
    expect(is_outdated("2.1.4", "latest")).toBe(false);
  });
});

describe("latest_release", () => {
  it("does not call out at all while the check is disabled", async () => {
    enabled(false);
    respond({ tag_name: "v2.1.5" });
    expect(await latest_release()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the tag and caches it for the next call", async () => {
    respond({ tag_name: "v2.1.5" });
    expect(await latest_release()).toBe("v2.1.5");
    expect(await latest_release()).toBe("v2.1.5");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns null on a rate limit, an error or an unusable tag", async () => {
    respond({ message: "rate limit exceeded" }, false);
    expect(await latest_release()).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await latest_release()).toBeNull();

    respond({ tag_name: "nightly" });
    expect(await latest_release()).toBeNull();
  });
});
