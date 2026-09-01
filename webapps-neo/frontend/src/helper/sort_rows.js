/**
 * sort_rows.js
 *
 * Client-side sorting for list pages, kept generic so a page only has to say
 * how to read a value out of one of its rows.
 *
 * Why client-side at all: `/process-definition/statistics` — the endpoint the
 * deployed-definitions list is built on — accepts `sortBy`/`sortOrder` and then
 * ignores them; ascending and descending come back in identical order. The
 * sorting on that list therefore never took effect, whichever control asked for
 * it. It also returns the full list in one response and takes no
 * `firstResult`/`maxResults`, so sorting in the client sees every row and is
 * exact rather than a per-page approximation.
 *
 * The URL keeps carrying `sortBy`/`sortOrder`: it stays the shareable source of
 * truth and is what a saved filter's sort override writes into.
 */

/**
 * Nulls and undefined sort last in both directions — an empty tenant should not
 * displace real values at the top just because the order flipped.
 */
export const compare_values = (a, b) => {
  const a_missing = a === null || a === undefined || a === "",
    b_missing = b === null || b === undefined || b === "";
  if (a_missing || b_missing)
    return a_missing && b_missing ? 0 : a_missing ? 1 : -1;

  if (typeof a === "number" && typeof b === "number") return a - b;

  // localeCompare with numeric collation, so "v2" sorts before "v10" and
  // capitalised keys do not clump ahead of lower-case ones.
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

/**
 * A sorted copy of `rows`. Unknown or absent `sortBy` leaves the order alone,
 * so a list keeps whatever the server sent until a column is actually chosen.
 *
 * @param rows     {Array}
 * @param sorting  {{ sortBy?: string, sortOrder?: "asc" | "desc" }}
 * @param value_of {(row, sortBy) => unknown} reads the value to compare
 */
export const sort_rows = (rows, { sortBy, sortOrder } = {}, value_of) => {
  if (!sortBy || typeof value_of !== "function") return rows;

  const direction = sortOrder === "desc" ? -1 : 1;
  // Copy first: the rows come straight out of a signal and must not be
  // reordered in place.
  return [...rows].sort(
    (a, b) =>
      direction * compare_values(value_of(a, sortBy), value_of(b, sortBy)),
  );
};
