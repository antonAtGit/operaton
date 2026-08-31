import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { h } from "preact";
import { render, cleanup, fireEvent } from "@testing-library/preact";

// Control the current location and capture programmatic navigation.
const route = vi.fn();
let mockUrl = "/";
vi.mock("preact-iso", () => ({
  useLocation: () => ({ url: mockUrl, route }),
}));

// useHotkeys pulls in React, which is null under the Preact test alias; stub it.
vi.mock("react-hotkeys-hook", () => ({ useHotkeys: vi.fn() }));

// Spy all engine_rest API functions but keep RESPONSE_STATE etc. real.
vi.mock("../api/engine_rest.jsx", async (importOriginal) => {
  const actual = await importOriginal();
  const spyify = (o) =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [
        k,
        typeof v === "function"
          ? vi.fn()
          : v && typeof v === "object"
            ? spyify(v)
            : v,
      ]),
    );
  return { ...actual, default: spyify(actual.default) };
});

// Icons pull no weight in these assertions; render lightweight stubs.
vi.mock("../assets/icons.jsx", () => ({
  close: () => h("span", { "data-testid": "icon-close" }),
  search: () => h("span", { "data-testid": "icon-search" }),
  server: () => h("span", { "data-testid": "icon-server" }),
}));

import { AppState } from "../state.js";
import engine_rest from "../api/engine_rest.jsx";
import { Header } from "./Header.jsx";
import { create_mock_state } from "../test/helpers.js";
import { register, _reset_registry } from "../plugins/registry.js";
import { PLUGIN_POINTS } from "../plugins/points.js";

const renderHeader = (state) =>
  render(h(AppState.Provider, { value: state }, h(Header, {})));

describe("Header", () => {
  let state;
  beforeEach(() => {
    _reset_registry();
    state = create_mock_state();
    mockUrl = "/";
    route.mockClear();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    _reset_registry();
  });

  it("carries no built-in page entries — the nav is plugin-driven", () => {
    const { container } = renderHeader(state);
    const nav = container.querySelector("#primary-navigation");
    // Tasks, Processes, Decisions, Deployments, Batches, Migrations and Admin
    // used to be hard-coded here. They are reached through the areas that group
    // them now, so with nothing registered the menu is empty. Their routes and
    // their GoTo entries are untouched.
    expect(nav.querySelectorAll("li > a")).toHaveLength(0);
  });

  it("renders an option per VITE_BACKEND server in the selector", () => {
    const { container } = renderHeader(state);
    const select = container.querySelector("#server-selector select");
    const labels = Array.from(select.querySelectorAll("option")).map((o) =>
      o.textContent.trim(),
    );
    // First option is the disabled placeholder, then the two backends.
    expect(labels).toContain("nav.choose-server");
    expect(labels.some((l) => l.startsWith("Test"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Other"))).toBe(true);
    // c7_mode server is annotated with "(C7)".
    expect(labels.some((l) => l.includes("(C7)"))).toBe(true);
  });

  it("updates state.server and persists to localStorage when the server changes", () => {
    const { container } = renderHeader(state);
    const select = container.querySelector("#server-selector select");
    fireEvent.change(select, { target: { value: "http://localhost:9090" } });
    expect(state.server.value).toMatchObject({
      name: "Other",
      url: "http://localhost:9090",
    });
    expect(JSON.parse(localStorage.getItem("server"))).toMatchObject({
      url: "http://localhost:9090",
    });
  });

  it("calls engine_rest.auth.logout when the logout button is clicked", () => {
    const { container } = renderHeader(state);
    fireEvent.click(container.querySelector("#logout"));
    expect(engine_rest.auth.logout).toHaveBeenCalled();
    // state is passed by reference; never compare structurally.
    expect(engine_rest.auth.logout.mock.lastCall[0]).toBe(state);
  });
});

describe("Header — plugin nav", () => {
  let state;
  beforeEach(() => {
    _reset_registry();
    register({
      id: "test-nav",
      point: PLUGIN_POINTS.PAGE,
      properties: { href: "/plugin/test-nav", nameKey: "plugins.test.nav" },
      Component: () => null,
    });
    state = create_mock_state();
    mockUrl = "/";
  });
  afterEach(() => {
    cleanup();
    _reset_registry();
  });

  it("renders a PAGE plugin entry in both the desktop and mobile menus", () => {
    const { container } = renderHeader(state);
    const desktop = container.querySelectorAll(
      '#primary-navigation a[href="/plugin/test-nav"]',
    );
    const mobile = container.querySelectorAll(
      '#mobile-menu a[href="/plugin/test-nav"]',
    );
    expect(desktop).toHaveLength(1);
    expect(mobile).toHaveLength(1);
  });

  it("marks the plugin entry aria-current when its route is active", () => {
    mockUrl = "/plugin/test-nav";
    const { container } = renderHeader(state);
    const link = container.querySelector(
      '#primary-navigation a[href="/plugin/test-nav"]',
    );
    expect(link.getAttribute("aria-current")).toBe("page");
  });
});

describe("Header — nav entries claiming other routes", () => {
  let state;
  beforeEach(() => {
    _reset_registry();
    register({
      id: "test-area",
      point: PLUGIN_POINTS.PAGE,
      properties: {
        href: "/test-area",
        nameKey: "plugins.test.area",
        match: ["/tasks", "/batches"],
      },
      Component: () => null,
    });
    state = create_mock_state();
    mockUrl = "/";
  });
  afterEach(() => {
    cleanup();
    _reset_registry();
  });

  const current = (container) =>
    container
      .querySelector('#primary-navigation a[href="/test-area"]')
      ?.getAttribute("aria-current");

  it("stays current on a route it claims via properties.match", () => {
    // An area has to keep its nav entry highlighted while the user is on one of
    // the pages it groups — otherwise nothing in the top bar is marked at all.
    mockUrl = "/tasks/task-1";
    expect(current(renderHeader(state).container)).toBe("page");
  });

  it("is current on its own route as well", () => {
    mockUrl = "/test-area";
    expect(current(renderHeader(state).container)).toBe("page");
  });

  it("is not current on an unclaimed route", () => {
    mockUrl = "/decisions";
    expect(current(renderHeader(state).container)).not.toBe("page");
  });
});
