import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/preact";
import descriptors, {
  AREAS,
  AreaPage,
  AreasWidget,
  links_for,
  is_authorized,
} from "./plugin.jsx";
import { register, _reset_registry } from "../../registry.js";
import { PLUGIN_POINTS } from "../../points.js";
import engine_rest from "../../../api/engine_rest.jsx";
import { plugin_apis } from "../../../api/plugins.js";
import { RESPONSE_STATE } from "../../../api/helper.jsx";
import { render_with_state } from "../../../test/render.jsx";
import {
  create_mock_state,
  signal_response,
  signal_error,
} from "../../../test/helpers.js";

const [api_descriptor, ...rest] = descriptors;
const page_descriptors = rest.filter((d) => d.point === PLUGIN_POINTS.PAGE);
const area_by_key = (key) => AREAS.find((area) => area.key === key);

beforeEach(() => {
  _reset_registry();
  for (const key of Object.keys(plugin_apis)) delete plugin_apis[key];
  descriptors.forEach(register);
});

describe("Areas plugin — descriptors", () => {
  it("contributes one API namespace, three pages and one dashboard widget", () => {
    expect(descriptors).toHaveLength(5);
    expect(api_descriptor.point).toBe(PLUGIN_POINTS.API);
    expect(page_descriptors).toHaveLength(3);
    expect(
      descriptors.filter((d) => d.point === PLUGIN_POINTS.DASHBOARD_WIDGET),
    ).toHaveLength(1);
  });

  it("routes the three areas to top-level paths", () => {
    expect(page_descriptors.map((d) => d.properties.path)).toEqual([
      "/arbeit",
      "/cockpit",
      "/verwaltung",
    ]);
  });

  it("gives every page the href and nameKey the primary nav needs", () => {
    for (const descriptor of page_descriptors) {
      expect(descriptor.properties.href).toBe(descriptor.properties.path);
      expect(descriptor.properties.nameKey).toMatch(/^plugins\.areas\./);
    }
  });

  it("claims the routes it groups, so the nav entry stays highlighted", () => {
    const claims = Object.fromEntries(
      AREAS.map((area) => [area.key, area.match]),
    );
    expect(claims.arbeit).toContain("/tasks");
    expect(claims.cockpit).toContain("/processes");
    expect(claims.verwaltung).toContain("/admin");
    // /decisions belongs to two areas, so neither may claim it — otherwise two
    // nav entries would report aria-current at once.
    for (const area of AREAS) expect(area.match).not.toContain("/decisions");
  });

  it("gives each area a distinct hotkey", () => {
    const hotkeys = page_descriptors.map((d) => d.properties.hotkey);
    expect(hotkeys).toEqual(["alt+shift+1", "alt+shift+2", "alt+shift+3"]);
    expect(new Set(hotkeys).size).toBe(3);
  });

  it("maps each area to the engine's existing application id", () => {
    expect(AREAS.map((area) => area.app_id)).toEqual([
      "tasklist",
      "cockpit",
      "admin",
    ]);
  });

  it("ships both locales for every area", () => {
    for (const locale of ["en-US", "de-DE"]) {
      const bundle = api_descriptor.translations[locale].plugins.areas;
      for (const area of AREAS) expect(bundle[area.key].nav).toBeTruthy();
    }
  });
});

describe("Areas plugin — area membership", () => {
  it("lists the area's own host links", () => {
    expect(links_for(area_by_key("verwaltung")).map((l) => l.href)).toEqual([
      "/admin/users",
      "/admin/groups",
      "/admin/tenants",
      "/admin/authorizations",
      "/admin/system",
    ]);
  });

  it("adopts a PAGE plugin that declares properties.area", () => {
    register({
      id: "some-report",
      point: PLUGIN_POINTS.PAGE,
      properties: {
        path: "/plugin/report",
        href: "/plugin/report",
        nameKey: "plugins.report.nav",
        area: "cockpit",
      },
      Component: () => null,
    });

    const hrefs = links_for(area_by_key("cockpit")).map((l) => l.href);
    expect(hrefs).toContain("/plugin/report");
  });

  it("ignores a PAGE plugin that belongs to no area", () => {
    register({
      id: "loose-page",
      point: PLUGIN_POINTS.PAGE,
      properties: {
        path: "/plugin/loose",
        href: "/plugin/loose",
        nameKey: "plugins.loose.nav",
      },
      Component: () => null,
    });

    const hrefs = links_for(area_by_key("cockpit")).map((l) => l.href);
    expect(hrefs).not.toContain("/plugin/loose");
  });
});

describe("Areas plugin — gating", () => {
  it("runs the Application ACCESS check for the area on mount", () => {
    const state = create_mock_state();
    vi.spyOn(engine_rest.plugins.areas, "check").mockImplementation(() => {});

    render_with_state(<AreaPage area={area_by_key("cockpit")} />, { state });

    expect(engine_rest.plugins.areas.check).toHaveBeenCalled();
    const [called_state, app_id] =
      engine_rest.plugins.areas.check.mock.lastCall;
    // Compare by reference — structurally matching `state` would recurse into
    // the signal tree and throw (see helpers.js expect_api_call).
    expect(called_state).toBe(state);
    expect(app_id).toBe("cockpit");
  });

  it("renders the area links when the check authorizes the user", () => {
    const state = create_mock_state();
    vi.spyOn(engine_rest.plugins.areas, "check").mockImplementation(() => {});
    signal_response(state.api.plugins.areas.access.cockpit, {
      authorized: true,
    });

    render_with_state(<AreaPage area={area_by_key("cockpit")} />, { state });

    expect(screen.getByText("nav.processes")).toBeTruthy();
    expect(screen.queryByText("plugins.areas.no-access")).toBeNull();
  });

  it("hides the links and explains why when access is denied", () => {
    const state = create_mock_state();
    vi.spyOn(engine_rest.plugins.areas, "check").mockImplementation(() => {});
    signal_response(state.api.plugins.areas.access.cockpit, {
      authorized: false,
    });

    render_with_state(<AreaPage area={area_by_key("cockpit")} />, { state });

    expect(screen.getByText("plugins.areas.no-access")).toBeTruthy();
    expect(screen.queryByText("nav.processes")).toBeNull();
  });

  it("fails open when the check errors — the pages stay reachable anyway", () => {
    const state = create_mock_state();
    vi.spyOn(engine_rest.plugins.areas, "check").mockImplementation(() => {});
    signal_error(state.api.plugins.areas.access.cockpit);

    render_with_state(<AreaPage area={area_by_key("cockpit")} />, { state });

    expect(screen.getByText("nav.processes")).toBeTruthy();
  });

  it("treats a pending check as authorized", () => {
    expect(is_authorized(undefined)).toBe(true);
    expect(is_authorized({ value: null })).toBe(true);
    expect(is_authorized({ value: { status: RESPONSE_STATE.LOADING } })).toBe(
      true,
    );
  });
});

describe("Areas plugin — dashboard widget", () => {
  it("checks every area and lists the ones the user may see", () => {
    const state = create_mock_state();
    vi.spyOn(engine_rest.plugins.areas, "check").mockImplementation(() => {});
    signal_response(state.api.plugins.areas.access.tasklist, {
      authorized: true,
    });
    signal_response(state.api.plugins.areas.access.cockpit, {
      authorized: false,
    });
    signal_response(state.api.plugins.areas.access.admin, { authorized: true });

    render_with_state(<AreasWidget />, { state });

    expect(engine_rest.plugins.areas.check).toHaveBeenCalledTimes(3);
    expect(screen.getByText("plugins.areas.arbeit.title")).toBeTruthy();
    expect(screen.getByText("plugins.areas.verwaltung.title")).toBeTruthy();
    expect(screen.queryByText("plugins.areas.cockpit.title")).toBeNull();
  });
});
