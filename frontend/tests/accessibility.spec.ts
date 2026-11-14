import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { startSignedIn } from "./helpers";

const scan = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }));
};

test("the sign in form has no accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("the registration form has no accessibility violations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("the board has no accessibility violations", async ({ page }) => {
  await startSignedIn(page);
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("the board with its panels and forms open has no violations", async ({ page }) => {
  await startSignedIn(page);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByRole("button", { name: "AI Assistant" }).click();
  await page.getByRole("button", { name: "Add a card" }).first().click();
  await page.getByRole("button", { name: /^Comments \(0\) on Gather customer signals$/ }).click();
  await expect(page.getByLabel("Add a comment")).toBeVisible();
  await page
    .getByTestId("card-card-1")
    .getByRole("button", { name: "Edit Align roadmap themes" })
    .click();
  await expect(page.getByRole("list", { name: "Members" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("the overview has no accessibility violations", async ({ page }) => {
  await startSignedIn(page);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("a card can be moved to another column with the keyboard", async ({ page }) => {
  await startSignedIn(page);
  const backlog = page.getByTestId("column-col-backlog");
  const discovery = page.getByTestId("column-col-discovery");
  await expect(backlog.getByTestId("card-card-1")).toBeVisible();

  await page.getByTestId("card-card-1").focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  // The library announces the move to screen readers; dropping before that lands on the same spot.
  await expect(page.locator("[aria-live]").getByText(/moved over droppable area card-3/)).toBeAttached();
  const saved = page.waitForResponse(
    (response) => response.request().method() === "PUT" && response.ok()
  );
  await page.keyboard.press("Space");
  await saved;

  await expect(discovery.getByTestId("card-card-1")).toBeVisible();
  await expect(backlog.getByTestId("card-card-1")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("column-col-discovery").getByTestId("card-card-1")).toBeVisible();
});

test("pressing space on a card's own buttons does not start a drag", async ({ page }) => {
  await startSignedIn(page);
  await page.getByRole("button", { name: "Edit Align roadmap themes" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Edit title")).toBeVisible();
  await expect(page.getByTestId("column-col-backlog").getByTestId("card-card-1")).toBeVisible();
});

test("the filter controls are reachable in tab order", async ({ page }) => {
  await startSignedIn(page);
  await page.getByLabel("Search cards").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Filter by priority")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Overdue only")).toBeFocused();
});
