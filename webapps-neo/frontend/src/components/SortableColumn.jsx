/**
 * SortableColumn
 *
 * A table header cell that sorts the list by its own column: clicking toggles
 * between ascending and descending, and the current column carries an arrow
 * plus `aria-sort` so the state is announced rather than only drawn.
 *
 * It drives the same `{ sortBy, sortOrder }` patch the sort dropdowns used, so
 * sorting stays server-side and the query string remains the single source of
 * truth — the header only offers a shorter way to say the same thing.
 *
 * `sort_key` must be a key the engine accepts for that list (the `key` values in
 * the page's SORT_OPTIONS). Columns the engine cannot sort — anything computed
 * client-side, such as the incident and instance counts — stay plain `<th>`.
 *
 * @param sort_key {string}                     engine sort key for this column
 * @param current  {{ sortBy, sortOrder }}      the list's active sorting
 * @param on_change {(patch) => void}           receives { sortBy, sortOrder }
 */
import * as Icons from "../assets/icons.jsx";

/** Toggle only while staying on the same column; a new column starts ascending. */
export const next_sort_order = (sort_key, current) =>
  current?.sortBy === sort_key && current?.sortOrder === "asc" ? "desc" : "asc";

const ARIA_SORT = { asc: "ascending", desc: "descending" };

export const SortableColumn = ({
  sort_key,
  current,
  on_change,
  class: css_class,
  title,
  children,
}) => {
  const is_active = current?.sortBy === sort_key,
    order = is_active ? (current?.sortOrder ?? "asc") : null;

  return (
    <th
      class={css_class}
      title={title}
      aria-sort={is_active ? (ARIA_SORT[order] ?? "ascending") : "none"}
    >
      <button
        type="button"
        class="sort-column"
        onClick={() =>
          on_change?.({
            sortBy: sort_key,
            sortOrder: next_sort_order(sort_key, current),
          })
        }
      >
        {children}
        {/* Decorative: `aria-sort` on the cell already carries the state. */}
        <span class="sort-indicator" aria-hidden="true">
          {order === "desc" ? <Icons.chevron_down /> : null}
          {order === "asc" ? <Icons.chevron_up /> : null}
        </span>
      </button>
    </th>
  );
};
