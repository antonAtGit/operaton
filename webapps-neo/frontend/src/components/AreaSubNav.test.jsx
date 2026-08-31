import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { h } from "preact";
import { render, cleanup } from "@testing-library/preact";

let mockUrl = "/";
vi.mock("preact-iso", () => ({ useLocation: () => ({ url: mockUrl }) }));

import { AreaSubNav, current_link, area_for } from "./AreaSubNav.jsx";
import { register, _reset_registry } from "../plugins/registry.js";
import { PLUGIN_POINTS } from "../plugins/points.js";

const AREA = {
  id: "test-area",
  point: PLUGIN_POINTS.PAGE,
  properties: {
    href: "/test-area",
    nameKey: "plugins.test.area",
    match: ["/tasks", "/batches"],
    links: [
      { href: "/tasks", label_key: "nav.tasks" },
      { href: "/tasks/start", label_key: "plugins.test.start" },
      { href: "/batches", label_key: "nav.batches" },
    ],
  },
  Component: () => null,
};

const items = (container) =>
  Array.from(container.querySelectorAll("menu.list li > a")).map((a) =>
    a.getAttribute("href"),
  );
const current = (container) =>
  container
    .querySelector('menu.list a[aria-current="page"]')
    ?.getAttribute("href");

beforeEach(() => {
  _reset_registry();
  register(AREA);
  mockUrl = "/";
});
afterEach(() => {
  cleanup();
  _reset_registry();
});

describe("AreaSubNav", () => {
  it("renders nothing on a route that belongs to no area", () => {
    mockUrl = "/account/profile";
    const { container } = render(h(AreaSubNav, {}));
    expect(container.querySelector("menu.list")).toBeNull();
  });

  it("lists the area's pages on a route the area claims", () => {
    mockUrl = "/tasks";
    const { container } = render(h(AreaSubNav, {}));
    expect(items(container)).toEqual(["/tasks", "/tasks/start", "/batches"]);
  });

  it("stays on the same list while navigating within the area", () => {
    mockUrl = "/batches/batch-7";
    const { container } = render(h(AreaSubNav, {}));
    expect(items(container)).toHaveLength(3);
    expect(current(container)).toBe("/batches");
  });

  it("marks the most specific link, not every prefix match", () => {
    // /tasks/start starts with both "/tasks" and "/tasks/start"; marking both
    // would put aria-current on two links at once.
    mockUrl = "/tasks/start";
    const { container } = render(h(AreaSubNav, {}));
    expect(current(container)).toBe("/tasks/start");
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(
      1,
    );
  });

  it("stays out of the way on the area's own landing page", () => {
    // The landing page already shows the same links as cards.
    mockUrl = "/test-area";
    const { container } = render(h(AreaSubNav, {}));
    expect(container.querySelector("menu.list")).toBeNull();
  });

  it("ignores an area that ships no links of its own", () => {
    // How the Administration area opts out: the Admin page renders its own
    // sidebar over the same links already.
    _reset_registry();
    register({
      ...AREA,
      properties: { ...AREA.properties, links: undefined },
    });
    mockUrl = "/tasks";
    const { container } = render(h(AreaSubNav, {}));
    expect(area_for("/tasks")).toBeUndefined();
    expect(container.querySelector("menu.list")).toBeNull();
  });
});

describe("current_link", () => {
  const links = [{ href: "/a" }, { href: "/a/b" }, { href: "/c" }];

  it("picks the longest matching href", () => {
    expect(current_link(links, "/a/b/c")).toBe("/a/b");
  });

  it("returns undefined when nothing matches", () => {
    expect(current_link(links, "/zzz")).toBeUndefined();
  });
});
