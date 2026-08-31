/**
 * AreaSubNav
 *
 * The sidebar listing the pages of the area the current route belongs to — the
 * second navigation level, below the primary nav's areas.
 *
 * It is rendered once, beside the routed page, rather than added to each page:
 * the pages an area groups are ordinary top-level pages with their own layouts,
 * and threading the same sidebar through every one of them would duplicate it
 * six times over.
 *
 * The data comes from the PAGE plugin that owns the area, via
 * `properties.links` and `properties.match`, so no area knowledge lives here.
 * A page that already ships its own sidebar (Admin) simply declares no `links`.
 */
import { useLocation } from "preact-iso";
import { useTranslation } from "react-i18next";
import { plugins_for } from "../plugins/registry.js";
import { PLUGIN_POINTS } from "../plugins/points.js";

/**
 * The area owning `url`, matched on `properties.match` only — deliberately not
 * on the area's own href, so its landing page shows just its cards and does not
 * repeat them in a sidebar next to itself.
 */
export const area_for = (url) =>
  plugins_for(PLUGIN_POINTS.PAGE).find(
    (plugin) =>
      plugin.properties?.links?.length &&
      (plugin.properties.match ?? []).some((prefix) => url.startsWith(prefix)),
  );

/**
 * The entry to mark current: the longest href the url starts with. Plain
 * `startsWith` would mark both "/tasks" and "/tasks/start" on the latter.
 */
export const current_link = (links, url) =>
  links
    .filter((link) => url.startsWith(link.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

export const AreaSubNav = () => {
  const { url } = useLocation(),
    [t] = useTranslation(),
    area = area_for(url);

  if (!area) return null;

  const links = area.properties.links,
    current = current_link(links, url);

  return (
    <nav aria-label={t(area.properties.nameKey)}>
      <menu class="list">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              aria-current={link.href === current ? "page" : undefined}
            >
              {t(link.label_key)}
            </a>
          </li>
        ))}
      </menu>
    </nav>
  );
};
