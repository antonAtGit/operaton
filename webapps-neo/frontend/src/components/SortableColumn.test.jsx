import { describe, it, expect, vi } from "vitest";
import { h } from "preact";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { afterEach } from "vitest";
import { SortableColumn, next_sort_order } from "./SortableColumn.jsx";

afterEach(cleanup);

const column = (props) =>
  render(
    h(
      "table",
      null,
      h("thead", null, h("tr", null, h(SortableColumn, props, "Name"))),
    ),
  );

describe("SortableColumn", () => {
  it("exposes the sort state on the cell, not only as an arrow", () => {
    // aria-sort is what a screen reader announces; the arrow is decorative.
    const { container } = column({
      sort_key: "name",
      current: { sortBy: "name", sortOrder: "asc" },
    });
    expect(container.querySelector("th").getAttribute("aria-sort")).toBe(
      "ascending",
    );
  });

  it("reports descending when the column is sorted the other way", () => {
    const { container } = column({
      sort_key: "name",
      current: { sortBy: "name", sortOrder: "desc" },
    });
    expect(container.querySelector("th").getAttribute("aria-sort")).toBe(
      "descending",
    );
  });

  it("reports none for a column that is not the sorted one", () => {
    const { container } = column({
      sort_key: "name",
      current: { sortBy: "key", sortOrder: "asc" },
    });
    expect(container.querySelector("th").getAttribute("aria-sort")).toBe(
      "none",
    );
  });

  it("sorts through a real button, so it is reachable by keyboard", () => {
    const { container } = column({ sort_key: "name", current: {} });
    const button = container.querySelector("th button");
    expect(button).toBeTruthy();
    expect(button.getAttribute("type")).toBe("button");
    expect(button.textContent).toContain("Name");
  });

  it("asks for ascending when a different column was sorted", () => {
    const on_change = vi.fn();
    const { container } = column({
      sort_key: "name",
      current: { sortBy: "key", sortOrder: "desc" },
      on_change,
    });
    fireEvent.click(container.querySelector("th button"));
    expect(on_change).toHaveBeenCalledWith({
      sortBy: "name",
      sortOrder: "asc",
    });
  });

  it("flips the direction when its own column is clicked again", () => {
    const on_change = vi.fn();
    const { container } = column({
      sort_key: "name",
      current: { sortBy: "name", sortOrder: "asc" },
      on_change,
    });
    fireEvent.click(container.querySelector("th button"));
    expect(on_change).toHaveBeenCalledWith({
      sortBy: "name",
      sortOrder: "desc",
    });
  });

  it("keeps the arrow out of the accessibility tree", () => {
    const { container } = column({
      sort_key: "name",
      current: { sortBy: "name", sortOrder: "asc" },
    });
    expect(
      container.querySelector(".sort-indicator").getAttribute("aria-hidden"),
    ).toBe("true");
  });
});

describe("next_sort_order", () => {
  it("toggles asc to desc on the same column", () => {
    expect(next_sort_order("name", { sortBy: "name", sortOrder: "asc" })).toBe(
      "desc",
    );
  });

  it("returns to ascending from descending", () => {
    expect(next_sort_order("name", { sortBy: "name", sortOrder: "desc" })).toBe(
      "asc",
    );
  });

  it("starts a new column ascending", () => {
    expect(next_sort_order("name", { sortBy: "key", sortOrder: "asc" })).toBe(
      "asc",
    );
  });
});
