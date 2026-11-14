import { expect, test } from "@playwright/test";
import { startSignedIn } from "./helpers";

test("the overview summarises boards and opens one", async ({ page }) => {
  await startSignedIn(page);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  const boards = page.getByRole("list", { name: "Boards" });
  await expect(boards.getByRole("heading", { name: "My Board" })).toBeVisible();
  await expect(boards.getByText(/^8 cards, 0 overdue, 0 high priority$/).first()).toBeVisible();
  await expect(page.getByRole("list", { name: "My Board columns" }).getByRole("listitem")).toHaveCount(5);

  await page.getByRole("button", { name: "Open My Board" }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "Overview" })).toHaveCount(0);
});

test("the overview counts overdue and high priority cards", async ({ page }) => {
  await startSignedIn(page);
  const board = await (await page.request.get("/api/boards/1")).json();
  board.cards["card-1"].dueDate = "2000-01-01";
  board.cards["card-1"].priority = "high";
  await page.request.put("/api/boards/1", { data: board });
  await page.reload();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByText(/^8 cards, 1 overdue, 1 high priority$/).first()).toBeVisible();
});
