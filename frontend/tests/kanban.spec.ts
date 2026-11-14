import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { dragCardToColumn, nextSave, startSignedIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await startSignedIn(page);
});

test("loads the kanban board", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card and keeps it after reload", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  const saved = nextSave(page);
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
  await saved;

  await page.reload();
  await expect(
    page.locator('[data-testid^="column-"]').first().getByText("Playwright card")
  ).toBeVisible();
  await expect(page.getByText("Added via e2e.")).toBeVisible();
});

test("edits a card and keeps it after reload", async ({ page }) => {
  await page.getByRole("button", { name: "Edit Align roadmap themes", exact: true }).click();
  await page.getByLabel("Edit title").fill("Edited in e2e");
  await page.getByLabel("Edit details").fill("New details");
  const saved = nextSave(page);
  await page.getByRole("button", { name: "Save" }).click();
  await saved;

  await page.reload();
  const card = page.getByTestId("card-card-1");
  await expect(card.getByText("Edited in e2e")).toBeVisible();
  await expect(card.getByText("New details")).toBeVisible();
});

test("does not drag a card while it is being edited", async ({ page }) => {
  await page.getByRole("button", { name: "Edit Align roadmap themes", exact: true }).click();
  await dragCardToColumn(page, "card-card-1", "column-col-review");
  await expect(
    page.getByTestId("column-col-backlog").getByTestId("card-card-1")
  ).toBeVisible();
  await expect(page.getByLabel("Edit title")).toBeVisible();
});

test("removes a card and keeps it removed after reload", async ({ page }) => {
  const saved = nextSave(page);
  await page.getByRole("button", { name: "Delete Align roadmap themes", exact: true }).click();
  await saved;

  await page.reload();
  await expect(page.getByTestId("card-card-2")).toBeVisible();
  await expect(page.getByTestId("card-card-1")).toHaveCount(0);
});

test("renames a column and keeps it after reload", async ({ page }) => {
  const input = page
    .getByTestId("column-col-backlog")
    .getByLabel("Column title");
  await input.fill("Ideas");
  const saved = nextSave(page);
  await input.press("Enter");
  await saved;

  await page.reload();
  await expect(
    page.getByTestId("column-col-backlog").getByLabel("Column title")
  ).toHaveValue("Ideas");
});

test("moves a card between columns and keeps it after reload", async ({ page }) => {
  const saved = nextSave(page);
  await dragCardToColumn(page, "card-card-1", "column-col-review");
  const targetColumn = page.getByTestId("column-col-review");
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
  await saved;

  await page.reload();
  await expect(
    page.getByTestId("column-col-review").getByTestId("card-card-1")
  ).toBeVisible();
  await expect(
    page.getByTestId("column-col-backlog").getByTestId("card-card-1")
  ).toHaveCount(0);
});

test("shows an error when a save fails", async ({ page }) => {
  await page.route("**/api/boards/1", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 500, json: { detail: "failed" } })
      : route.continue()
  );
  await page.getByRole("button", { name: "Delete Align roadmap themes", exact: true }).click();
  await expect(page.getByText("Your last change could not be saved.")).toBeVisible();
});

test("keeps changes and the session across a container restart", async ({ page }) => {
  const saved = nextSave(page);
  await page.getByRole("button", { name: "Delete Align roadmap themes", exact: true }).click();
  await saved;

  execSync("docker compose -p pm-e2e -f ../docker-compose.yml restart", {
    env: { ...process.env, PORT: "8001" },
    stdio: "ignore",
  });
  await expect(async () => {
    expect((await page.request.get("/api/health")).ok()).toBe(true);
  }).toPass({ timeout: 30_000 });

  await page.reload();
  await expect(page.getByTestId("card-card-2")).toBeVisible();
  await expect(page.getByTestId("card-card-1")).toHaveCount(0);
});
