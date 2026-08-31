// noinspection HtmlUnknownAnchorTarget,JSValidateTypes

import { useLocation } from "preact-iso";
import * as Icons from "../assets/icons.jsx";
import { useHotkeys } from "react-hotkeys-hook";
import { useContext } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { AppState } from "../state.js";
import engine_rest from "../api/engine_rest.jsx";
import { plugins_for } from "../plugins/registry.js";
import { PLUGIN_POINTS } from "../plugins/points.js";
import { get_config } from "../config.js";

const swap_server = (e, state) => {
  const server = get_config().backends.find((s) => s.url === e.target.value);
  state.server.value = server;
  localStorage.setItem("server", JSON.stringify(server));
};

// Every PAGE plugin's nav entry — the single source of truth for both the
// desktop menu and the mobile dialog.
//
// The primary nav is plugin-driven only. It used to also carry a flat built-in
// list (Tasks, Processes, Decisions, Deployments, Batches, Migrations, Admin);
// those pages are now reached through the areas that group them, so listing
// them here as well duplicated every entry. The routes are unchanged and the
// command palette (GoTo) still indexes all of them, so nothing became
// unreachable — only the top bar got shorter.
const nav_entries = () =>
  plugins_for(PLUGIN_POINTS.PAGE)
    .filter((plugin) => plugin.properties?.href && plugin.properties?.nameKey)
    .map((plugin) => ({
      href: plugin.properties.href,
      nameKey: plugin.properties.nameKey,
      hotkey: plugin.properties.hotkey,
      match: plugin.properties.match,
    }));

// A nav entry is current on its own route, and on any route it declares via
// `properties.match` — that is how an area stays highlighted while you are on
// one of the pages it groups (e.g. /tasks keeps "Arbeitsbereich" marked). A
// path claimed by two entries is left out of both, so exactly one entry can be
// current at a time.
const is_current = (entry, url) =>
  url.startsWith(entry.href) ||
  (entry.match ?? []).some((prefix) => url.startsWith(prefix));

// Rendered in both the desktop <menu> and the mobile <dialog> so nav entries
// are declared exactly once.
const MainNavEntries = ({ url, on_navigate }) => {
  const [t] = useTranslation();
  return nav_entries().map((entry) => (
    <li key={entry.href}>
      <a
        href={entry.href}
        aria-current={is_current(entry, url) ? "page" : undefined}
        onClick={on_navigate}
      >
        {t(entry.nameKey)}
      </a>
    </li>
  ));
};

export function Header() {
  const { url, route } = useLocation(),
    state = useContext(AppState),
    [t] = useTranslation(),
    // dialogs
    showSearch = () => document.getElementById("global-search").showModal(),
    show_mobile_menu = () => document.getElementById("mobile-menu").showModal(),
    close_mobile_menu = () => document.getElementById("mobile-menu").close(),
    logout = () => engine_rest.auth.logout(state);

  // alt+shift+0 is the logo link; every other nav hotkey now comes from the
  // PAGE plugin that owns the entry (see below).
  useHotkeys("alt+shift+0", () => route("/"));

  // Plugin page hotkeys, resolved in one handler. The list is frozen before
  // render, so the combined keys string is stable across renders.
  const plugin_hotkeys = plugins_for(PLUGIN_POINTS.PAGE)
    .filter((plugin) => plugin.properties?.hotkey && plugin.properties?.href)
    .map((plugin) => ({
      hotkey: plugin.properties.hotkey,
      href: plugin.properties.href,
    }));

  useHotkeys(
    plugin_hotkeys.map((entry) => entry.hotkey).join(",") || "f13",
    (_event, handler) => {
      // react-hotkeys-hook 5 lower-cases `handler.hotkey`, so normalise both
      // sides — a plugin may declare its hotkey in any casing.
      const normalise = (hotkey) => hotkey.replaceAll(" ", "").toLowerCase();
      const pressed = normalise(
        handler?.hotkey ?? handler?.keys?.join("+") ?? "",
      );
      const hit = plugin_hotkeys.find(
        (entry) => normalise(entry.hotkey) === pressed,
      );
      if (hit) route(hit.href);
    },
  );

  return (
    <>
      <header id="top">
        {/* Reads the runtime flag, not a build-time env var, so a distro operator can
            turn the notice off without rebuilding the bundle. */}
        {get_config().hide_release_warning ? null : (
          <div id="release-warning">
            {t("nav.release-warning")}{" "}
            <a href="https://github.com/operaton/operaton/issues">
              {t("nav.release-warning-issue")}
            </a>{" "}
            {t("nav.release-warning-forum") !==
              t("nav.release-warning-issue") && (
              <>
                {t("nav.release-warning-or")}{" "}
                <a href="https://forum.operaton.org/">
                  {t("nav.release-warning-forum")}
                </a>
              </>
            )}
          </div>
        )}

        <menu id="skip-links">
          <li>
            <a href="#content">{t("nav.skip-to-content")}</a>
          </li>
        </menu>

        <a href="/" id="mobile-logo">
          OPERATON
        </a>
        <a
          href="/"
          id="logo"
          aria-label="Operaton"
          aria-current={url === "/" ? "page" : undefined}
        >
          <img src="/operaton-logo.svg" alt="Operaton" />
        </a>
        <button
          type="button"
          id="mobile-menu-toggle"
          onClick={show_mobile_menu}
          aria-label={t("nav.menu")}
        />
        <div id="nav-wrapper">
          <nav id="primary-navigation" aria-label={t("nav.main-navigation")}>
            <menu>
              <MainNavEntries url={url} />
            </menu>
          </nav>
          <div>
            <label id="server-selector">
              {/* <Icons.server />*/}
              <span>{t("nav.server")}</span>
              <select onChange={(e) => swap_server(e, state)}>
                <option disabled>{t("nav.choose-server")}</option>
                {get_config().backends.map((server) => (
                  <option
                    key={server.url}
                    value={server.url}
                    selected={state.server.value?.url === server.url}
                  >
                    {server.name} {server.c7_mode ? "(C7)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" id="go-to" onClick={showSearch}>
              {t("nav.go-to")} <kbd>Alt+K</kbd>
            </button>
            <div>
              <nav id="secondary-navigation">
                <menu>
                  <li>
                    <a
                      href="/help"
                      aria-current={
                        url.startsWith("/help") ? "page" : undefined
                      }
                    >
                      {t("nav.help")}
                    </a>
                  </li>
                  <li>
                    <a
                      href="/account"
                      aria-current={
                        url.startsWith("/account") ? "page" : undefined
                      }
                    >
                      {t("nav.account")}
                    </a>
                  </li>
                </menu>
              </nav>
              <button type="button" id="logout" onClick={logout}>
                {t("nav.logout")}
              </button>
            </div>
          </div>
        </div>
      </header>

      <dialog id="mobile-menu">
        <header>
          <h2>{t("nav.menu")}</h2>
          <button
            type="button"
            onClick={close_mobile_menu}
            aria-label={t("nav.close-menu")}
          >
            <Icons.close />
          </button>
        </header>
        <nav aria-label={t("nav.mobile-navigation")}>
          <menu>
            <MainNavEntries url={url} on_navigate={close_mobile_menu} />
          </menu>
          <menu>
            <li>
              <a href="/help">{t("nav.help")}</a>
            </li>
            <li>
              <a href="/account">{t("nav.account")}</a>
            </li>
            <li>
              <button
                type="button"
                id="mobile-logout"
                onClick={() => {
                  close_mobile_menu();
                  logout();
                }}
              >
                {t("nav.logout")}
              </button>
            </li>
          </menu>
        </nav>
        <menu>
          <li>
            <button
              type="button"
              onClick={() => {
                close_mobile_menu();
                showSearch();
              }}
            >
              <Icons.search />
              {t("nav.go-to")}
            </button>
          </li>
          <li>
            <label id="mobile-server-selector">
              <Icons.server />
              <select
                aria-label={t("nav.choose-server")}
                onChange={(e) => swap_server(e, state)}
              >
                <option disabled>{t("nav.choose-server")}</option>
                {get_config().backends.map((server) => (
                  <option
                    key={server.url}
                    value={server.url}
                    selected={state.server.value?.url === server.url}
                  >
                    {server.name} {server.c7_mode ? "(C7)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </li>
        </menu>
      </dialog>
    </>
  );
}
