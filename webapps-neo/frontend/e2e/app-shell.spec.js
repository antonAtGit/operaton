import { test, expect } from "./fixtures.js";

/**
 * The app used to render straight into <body>, which was also the flex column
 * laying out the header, main and dialogs. A browser extension that reorders
 * the body's children then reordered the app's layout with it, and the header
 * landed at the bottom of the page (reproduced in Brave with extensions on;
 * correct in a private window).
 *
 * Both halves of the fix are exercised here: the app has its own container, so
 * body-level reordering cannot reach it, and `#top { order: -1 }` pins the
 * header to the top of the column whatever its DOM index.
 */
test.describe("app shell", () => {
  test("the app mounts in its own container, not in body", async ({ page }) => {
    const parent = await page.evaluate(
      () => document.getElementById("app")?.tagName,
    );
    expect(parent).toBe("DIV");
  });

  test("the header stays on top when the app's children are reordered", async ({
    page,
  }) => {
    const header_top = () =>
      page.locator("#top").evaluate((el) => el.getBoundingClientRect().top);

    expect(await header_top()).toBeLessThanOrEqual(1);

    // Exactly what the extension did: move the header to the end of its parent.
    await page.evaluate(() =>
      document
        .getElementById("app")
        .appendChild(document.getElementById("top")),
    );

    expect(await header_top()).toBeLessThanOrEqual(1);
  });

  test("the header stays on top when body's children are reordered", async ({
    page,
  }) => {
    await page.evaluate(() =>
      document.body.appendChild(document.getElementById("app")),
    );

    const top = await page
      .locator("#top")
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThanOrEqual(1);
  });
});
