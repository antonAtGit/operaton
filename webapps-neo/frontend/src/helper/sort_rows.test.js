import { describe, it, expect } from "vitest";
import { compare_values, sort_rows } from "./sort_rows.js";

const rows = [
  { definition: { name: "Beta", version: 2 }, incidents: 5 },
  { definition: { name: "alpha", version: 10 }, incidents: 0 },
  { definition: { name: "Gamma", version: 1 }, incidents: 2 },
];
const value_of = (row, key) =>
  key === "incidents" ? row.incidents : row.definition[key];
const names = (list) => list.map((r) => r.definition.name);

describe("compare_values", () => {
  it("compares numbers numerically, not as text", () => {
    expect(compare_values(2, 10)).toBeLessThan(0);
  });

  it("compares strings case-insensitively", () => {
    // Otherwise every capitalised key clumps ahead of the lower-case ones.
    expect(compare_values("alpha", "Beta")).toBeLessThan(0);
  });

  it("orders embedded numbers by value", () => {
    expect(compare_values("v2", "v10")).toBeLessThan(0);
  });

  it("sorts missing values last, in both directions", () => {
    // A row with no tenant must not lead the list just because the order
    // flipped, so `null` is last ascending *and* first-from-the-end descending.
    expect(compare_values(null, "a")).toBeGreaterThan(0);
    expect(compare_values("a", undefined)).toBeLessThan(0);
    expect(compare_values("", null)).toBe(0);
  });
});

describe("sort_rows", () => {
  it("sorts ascending by default", () => {
    expect(names(sort_rows(rows, { sortBy: "name" }, value_of))).toEqual([
      "alpha",
      "Beta",
      "Gamma",
    ]);
  });

  it("reverses for descending", () => {
    expect(
      names(sort_rows(rows, { sortBy: "name", sortOrder: "desc" }, value_of)),
    ).toEqual(["Gamma", "Beta", "alpha"]);
  });

  it("sorts a numeric column by value", () => {
    expect(
      sort_rows(rows, { sortBy: "version" }, value_of).map(
        (r) => r.definition.version,
      ),
    ).toEqual([1, 2, 10]);
  });

  it("sorts a column the engine cannot sort at all", () => {
    // incidents/instances are aggregated in the client; sorting them is the
    // whole reason this happens here rather than in the query.
    expect(
      sort_rows(rows, { sortBy: "incidents" }, value_of).map(
        (r) => r.incidents,
      ),
    ).toEqual([0, 2, 5]);
  });

  it("leaves the order alone without a sort column", () => {
    expect(names(sort_rows(rows, {}, value_of))).toEqual(names(rows));
  });

  it("never reorders the array it was given", () => {
    // The rows come straight out of a signal; sorting in place would mutate it.
    const original = [...rows];
    sort_rows(rows, { sortBy: "name" }, value_of);
    expect(rows).toEqual(original);
  });
});
