/**
 * Areas — the three-area navigation layer (Arbeitsbereich / Cockpit /
 * Administration) with Application-ACCESS gating.
 *
 * Strictly additive: this plugin adds three PAGE sections and one dashboard
 * widget and touches no host file. The existing flat primary nav stays exactly
 * as it is; the area pages are a second, role-oriented way into the same
 * screens.
 *
 * Gating uses the engine's own Application authorization (resourceType 0,
 * permission ACCESS) and deliberately reuses the app ids `tasklist`, `cockpit`
 * and `admin`, so an installation migrated from Camunda keeps the app
 * authorizations it already has. Admins grant an area through the existing
 * authorization UI under /admin/authorizations — no frontend convention, no
 * extra configuration.
 *
 * The area labels ("Cockpit — Monitoring & Betrieb") are a pure frontend
 * mapping from resourceId to an i18n key: an Authorization has no description
 * field, so there is nothing to store them in engine-side.
 */
import { useEffect } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { signal } from "@preact/signals";
import { GET, RESPONSE_STATE } from "../../../api/helper.jsx";
import { PLUGIN_POINTS } from "../../points.js";
import { plugins_for } from "../../registry.js";
import { use_plugin_api } from "../../plugin_api.jsx";
import "./areas.css";

const PLUGIN_ID = "areas";

/**
 * The area model. `app_id` is the engine's Application resourceId; `links` are
 * host routes, labelled with the host's own i18n keys wherever one exists so
 * an area never drifts from the page it points at.
 */
const AREAS = [
  {
    key: "arbeit",
    path: "/arbeit",
    app_id: "tasklist",
    hotkey: "alt+shift+1",
    // Routes that keep this area marked current in the primary nav. /decisions
    // is deliberately absent: both Arbeitsbereich and Cockpit link to it, and a
    // path claimed twice would mark two entries at once.
    match: ["/tasks"],
    links: [
      { href: "/tasks", label_key: "nav.tasks" },
      { href: "/tasks/start", label_key: "plugins.areas.links.start-process" },
      { href: "/decisions", label_key: "nav.decisions" },
    ],
  },
  {
    key: "cockpit",
    path: "/cockpit",
    app_id: "cockpit",
    hotkey: "alt+shift+2",
    match: ["/processes", "/deployments", "/migrations", "/batches"],
    links: [
      { href: "/processes", label_key: "nav.processes" },
      { href: "/decisions", label_key: "nav.decisions" },
      { href: "/deployments", label_key: "nav.deployments" },
      { href: "/migrations", label_key: "nav.migrations" },
      { href: "/batches", label_key: "nav.batches" },
    ],
  },
  {
    key: "verwaltung",
    path: "/verwaltung",
    app_id: "admin",
    hotkey: "alt+shift+3",
    match: ["/admin"],
    links: [
      { href: "/admin/users", label_key: "admin.users" },
      { href: "/admin/groups", label_key: "admin.groups" },
      { href: "/admin/tenants", label_key: "admin.tenants" },
      { href: "/admin/authorizations", label_key: "admin.authorizations" },
      { href: "/admin/system", label_key: "admin.system" },
    ],
  },
];

/**
 * Other PAGE plugins can join an area by declaring `properties.area`, so a
 * plugin page lands in the right section without this plugin knowing it exists
 * (the bundled Metrics page uses it to appear under Cockpit).
 */
const plugin_links_for = (area_key) =>
  plugins_for(PLUGIN_POINTS.PAGE)
    .filter(
      (plugin) =>
        plugin.properties?.area === area_key &&
        plugin.properties?.href &&
        plugin.properties?.nameKey,
    )
    .map((plugin) => ({
      href: plugin.properties.href,
      label_key: plugin.properties.nameKey,
    }));

export const links_for = (area) => [
  ...area.links,
  ...plugin_links_for(area.key),
];

// API namespace — mounted at engine_rest.plugins.areas. The engine resolves
// group -> access itself, so one call per area is all the gating needs.
const api = {
  check: (state, app_id) =>
    GET(
      "/authorization/check?permissionName=ACCESS&resourceName=application" +
        `&resourceType=0&resourceId=${app_id}`,
      state,
      state.api.plugins[PLUGIN_ID].access[app_id],
    ),
};

// State branch — mounted at state.api.plugins.areas, one signal per area.
const make_signals = () => ({
  access: Object.fromEntries(AREAS.map((area) => [area.app_id, signal(null)])),
});

/**
 * Fail open. This layer is navigational, not a security boundary: every screen
 * an area links to stays reachable through the flat primary nav, and the real
 * enforcement is the engine's resource authorization on the page itself. A
 * pending, failed or unavailable check therefore shows the area — only an
 * explicit `authorized: false` hides it.
 *
 * Note this also means an engine with authorization disabled shows every area
 * to everyone, because the check answers `true` for every user.
 */
export const is_authorized = (signl) => {
  const result = signl?.value;
  if (!result || result.status !== RESPONSE_STATE.SUCCESS) return true;
  return result.data?.authorized !== false;
};

/* eslint-disable react-hooks/rules-of-hooks --
   Same reason as in plugin_api.jsx: this is a custom hook, but the project
   names functions in snake_case, which the rule's `useCamelCase` heuristic
   cannot recognise. */
/** Runs the Application-ACCESS check for one area, returns its signal. */
const use_area_access = (area) => {
  const { state, api: areas, signals } = use_plugin_api(PLUGIN_ID);
  const signl = signals.access?.[area.app_id];

  useEffect(() => {
    areas.check?.(state, area.app_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.app_id]);

  return signl;
};

const AreaLinks = ({ area }) => {
  const [t] = useTranslation();

  return (
    <nav aria-label={t(`plugins.areas.${area.key}.title`)}>
      <menu class="area-links">
        {links_for(area).map((link) => (
          <li key={link.href}>
            <a href={link.href}>{t(link.label_key)}</a>
          </li>
        ))}
      </menu>
    </nav>
  );
};

const AreaPage = ({ area }) => {
  const access = use_area_access(area);
  const [t] = useTranslation();

  return (
    <main id="content" class="area-page fade-in">
      <h1>{t(`plugins.areas.${area.key}.title`)}</h1>
      <p class="area-subtitle">{t(`plugins.areas.${area.key}.subtitle`)}</p>
      {is_authorized(access) ? (
        <AreaLinks area={area} />
      ) : (
        <p class="area-no-access">
          {t("plugins.areas.no-access", {
            area: t(`plugins.areas.${area.key}.title`),
          })}
        </p>
      )}
    </main>
  );
};

/** Dashboard card: the three areas as an entry point, gated the same way. */
const AreasWidget = () => {
  const { state, api: areas, signals } = use_plugin_api(PLUGIN_ID);
  const [t] = useTranslation();

  useEffect(() => {
    AREAS.forEach((area) => areas.check?.(state, area.app_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = AREAS.filter((area) =>
    is_authorized(signals.access?.[area.app_id]),
  );

  return (
    <section class="areas-widget">
      <h2>{t("plugins.areas.widget.title")}</h2>
      <nav aria-label={t("plugins.areas.widget.title")}>
        <menu class="area-cards">
          {visible.map((area) => (
            <li key={area.key}>
              <a href={area.path}>
                <h3>{t(`plugins.areas.${area.key}.title`)}</h3>
                <p>{t(`plugins.areas.${area.key}.subtitle`)}</p>
              </a>
            </li>
          ))}
        </menu>
      </nav>
    </section>
  );
};

const translations = {
  "en-US": {
    plugins: {
      areas: {
        arbeit: {
          nav: "Workspace",
          title: "Workspace",
          subtitle: "Work on tasks and start processes",
        },
        cockpit: {
          nav: "Cockpit",
          title: "Cockpit",
          subtitle: "Monitoring & operations",
        },
        verwaltung: {
          nav: "Administration",
          title: "Administration",
          subtitle: "Users, groups, tenants and system",
        },
        links: { "start-process": "Start process" },
        "no-access":
          "You have no access to {{area}}. An administrator grants it under Administration → Authorizations.",
        widget: { title: "Areas" },
      },
    },
  },
  "de-DE": {
    plugins: {
      areas: {
        arbeit: {
          nav: "Arbeitsbereich",
          title: "Arbeitsbereich",
          subtitle: "Aufgaben bearbeiten und Prozesse starten",
        },
        cockpit: {
          nav: "Cockpit",
          title: "Cockpit",
          subtitle: "Monitoring & Betrieb",
        },
        verwaltung: {
          nav: "Administration",
          title: "Administration",
          subtitle: "Benutzer, Gruppen, Mandanten und System",
        },
        links: { "start-process": "Prozess starten" },
        "no-access":
          "Sie haben keinen Zugriff auf {{area}}. Ein Administrator vergibt ihn unter Administration → Autorisierungen.",
        widget: { title: "Bereiche" },
      },
    },
  },
};

const page_descriptor = (area) => ({
  id: `area-${area.key}`,
  point: PLUGIN_POINTS.PAGE,
  properties: {
    path: area.path,
    href: area.path,
    nameKey: `plugins.areas.${area.key}.nav`,
    hotkey: area.hotkey,
    match: area.match,
  },
  Component: () => <AreaPage area={area} />,
});

export { AREAS, AreaPage, AreasWidget, api, make_signals };

export default [
  // The shared API namespace, state branch and translations for all areas.
  {
    id: PLUGIN_ID,
    point: PLUGIN_POINTS.API,
    api,
    signals: make_signals,
    translations,
  },
  ...AREAS.map(page_descriptor),
  {
    id: "areas-widget",
    point: PLUGIN_POINTS.DASHBOARD_WIDGET,
    Component: AreasWidget,
  },
];
