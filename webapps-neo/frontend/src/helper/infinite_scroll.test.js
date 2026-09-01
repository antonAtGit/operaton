import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { h } from "preact";
import { render, cleanup } from "@testing-library/preact";
import { use_infinite_scroll } from "./infinite_scroll.js";

/**
 * A controllable IntersectionObserver: `observers` collects the live ones so a
 * test can decide when the sentinel comes into view, and `disconnected` records
 * teardown.
 */
let observers = [];

class FakeObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.observed = [];
    this.disconnected = false;
    observers.push(this);
  }
  observe(element) {
    this.observed.push(element);
  }
  disconnect() {
    this.disconnected = true;
  }
  /** Pretend the sentinel scrolled into (or out of) view. */
  fire(isIntersecting = true) {
    this.callback([{ isIntersecting }]);
  }
}

const Probe = ({ load_more, enabled }) => {
  const sentinel = use_infinite_scroll(load_more, { enabled });
  return h("div", { ref: sentinel, "data-testid": "sentinel" });
};

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("use_infinite_scroll", () => {
  it("loads the next page once its sentinel comes into view", () => {
    const load_more = vi.fn();
    render(h(Probe, { load_more, enabled: true }));
    observers[0].fire(true);
    expect(load_more).toHaveBeenCalledTimes(1);
  });

  it("stays quiet while the sentinel is out of view", () => {
    const load_more = vi.fn();
    render(h(Probe, { load_more, enabled: true }));
    observers[0].fire(false);
    expect(load_more).not.toHaveBeenCalled();
  });

  it("observes nothing while disabled — the in-flight guard", () => {
    // `enabled` is false while a request runs, so a second scroll event cannot
    // fire off a duplicate page request.
    const load_more = vi.fn();
    render(h(Probe, { load_more, enabled: false }));
    expect(observers).toHaveLength(0);
    expect(load_more).not.toHaveBeenCalled();
  });

  it("watches again once re-enabled, so a short page keeps filling", () => {
    // IntersectionObserver reports changes, not states: after a page loads
    // while the sentinel never left the viewport, only a fresh observer fires
    // again. Without this the list stalls on a viewport it did not fill.
    const load_more = vi.fn();
    const { rerender } = render(h(Probe, { load_more, enabled: true }));
    observers[0].fire(true);
    rerender(h(Probe, { load_more, enabled: false }));
    rerender(h(Probe, { load_more, enabled: true }));
    expect(observers).toHaveLength(2);
    observers[1].fire(true);
    expect(load_more).toHaveBeenCalledTimes(2);
  });

  it("disconnects when the list goes away", () => {
    const { unmount } = render(h(Probe, { load_more: vi.fn(), enabled: true }));
    unmount();
    expect(observers[0].disconnected).toBe(true);
  });

  it("fetches slightly before the true end of the list", () => {
    render(h(Probe, { load_more: vi.fn(), enabled: true }));
    expect(observers[0].options.rootMargin).toBe("200px");
  });

  it("calls the newest callback without rebuilding the observer", () => {
    // The callback closes over the current row count, so it changes on every
    // render; rebuilding the observer each time would re-fire immediately.
    const first = vi.fn(),
      second = vi.fn();
    const { rerender } = render(h(Probe, { load_more: first, enabled: true }));
    rerender(h(Probe, { load_more: second, enabled: true }));
    expect(observers).toHaveLength(1);
    observers[0].fire(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("leaves the load-more button as the way through with no observer", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const load_more = vi.fn();
    expect(() => render(h(Probe, { load_more, enabled: true }))).not.toThrow();
    expect(load_more).not.toHaveBeenCalled();
  });
});
