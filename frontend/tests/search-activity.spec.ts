import { expect, test } from "@playwright/test";
import { nextSave, startSignedIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await startSignedIn(page);
});

test("searches and filters cards without changing the board", async ({ page }) => {
  const cards = page.locator('[data-testid^="card-"]');
  await expect(cards).toHaveCount(8);

  await page.getByLabel("Search cards").fill("roadmap");
  await expect(cards).toHaveCount(1);
  await expect(page.getByTestId("card-card-1")).toBeVisible();

  await page.getByLabel("Search cards").fill("");
  await page.getByLabel("Filter by priority").selectOption("high");
  await expect(cards).toHaveCount(0);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(cards).toHaveCount(8);

  // Filtering is only a view: a reload shows everything.
  await page.getByLabel("Search cards").fill("roadmap");
  await page.reload();
  await expect(cards).toHaveCount(8);
});

test("records changes in the activity panel", async ({ page }) => {
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByText("No changes yet.").or(page.getByRole("list", { name: "Activity" }))).toBeVisible();

  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: "Edit Align roadmap themes" }).click();
  await card.getByLabel("Edit title").fill("Activity check");
  const saved = nextSave(page);
  await card.getByRole("button", { name: "Save" }).click();
  await saved;

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(
    page.getByRole("list", { name: "Activity" }).getByText('edited card "Align roadmap themes"').first()
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Activity" }).getByText("user").first()).toBeVisible();
});
