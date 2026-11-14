import { expect, test } from "@playwright/test";

const columns = (page: import("@playwright/test").Page) =>
  page.locator('[data-testid^="column-"]');

const boardsNav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Boards" });

const register = async (page: import("@playwright/test").Page, username: string) => {
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("password1");
  await page.getByRole("button", { name: "Create account" }).click();
};

const registerAndOpen = async (page: import("@playwright/test").Page, username: string) => {
  await register(page, username);
  await expect(columns(page).first()).toBeVisible();
};

test("a new user registers, gets an empty board, and keeps the session", async ({ page }) => {
  await registerAndOpen(page, `reg${Date.now()}`);
  await expect(columns(page)).toHaveCount(3);
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);
  await page.reload();
  await expect(columns(page)).toHaveCount(3);
});

test("registration rejects a taken username", async ({ page }) => {
  await register(page, "user");
  await expect(page.getByText("That username is taken.")).toBeVisible();
});

test("a user creates, renames, switches and deletes boards", async ({ page }) => {
  await registerAndOpen(page, `boards${Date.now()}`);
  const nav = boardsNav(page);
  await expect(nav.getByRole("button", { name: "My Board" })).toHaveAttribute("aria-pressed", "true");

  await nav.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill("Launch");
  await page.getByLabel("Board name").press("Enter");
  await expect(nav.getByRole("button", { name: "Launch" })).toHaveAttribute("aria-pressed", "true");

  // Add a card to the new board; it must not appear on the first one.
  await page.getByRole("button", { name: "Add a card" }).first().click();
  await page.getByPlaceholder("Card title").fill("Launch card");
  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByText("Launch card")).toBeVisible();

  await nav.getByRole("button", { name: "My Board" }).click();
  await expect(page.getByText("Launch card")).toHaveCount(0);

  await nav.getByRole("button", { name: "Launch" }).click();
  await expect(page.getByText("Launch card")).toBeVisible();

  await nav.getByRole("button", { name: "Rename board" }).click();
  await page.getByLabel("Board name").fill("Shipped");
  await page.getByLabel("Board name").press("Enter");
  await expect(nav.getByRole("button", { name: "Shipped" })).toBeVisible();
  await page.reload();
  await expect(nav.getByRole("button", { name: "Shipped" })).toBeVisible();

  // After a reload the first board is open again.
  await nav.getByRole("button", { name: "Shipped" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await nav.getByRole("button", { name: "Delete board" }).click();
  await expect(nav.getByRole("button", { name: "Shipped" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "My Board" })).toHaveAttribute("aria-pressed", "true");
  await expect(nav.getByRole("button", { name: "Delete board" })).toHaveCount(0);
});

test("users cannot see each other's boards", async ({ browser }) => {
  const first = await browser.newPage({ baseURL: "http://127.0.0.1:8001" });
  const second = await browser.newPage({ baseURL: "http://127.0.0.1:8001" });
  await registerAndOpen(first, `iso1${Date.now()}`);
  await registerAndOpen(second, `iso2${Date.now()}`);
  const id = (await (await first.request.get("/api/boards")).json())[0].id;
  expect((await second.request.get(`/api/boards/${id}`)).status()).toBe(404);
  await first.close();
  await second.close();
});

test("a user adds, renames and deletes columns", async ({ page }) => {
  await registerAndOpen(page, `cols${Date.now()}`);
  await page.getByRole("button", { name: "Add column" }).click();
  await expect(columns(page)).toHaveCount(4);

  const added = columns(page).nth(3);
  const title = added.getByLabel("Column title");
  await title.fill("Blocked");
  await title.press("Enter");

  await page.reload();
  await expect(columns(page)).toHaveCount(4);
  await expect(columns(page).nth(3).getByLabel("Column title")).toHaveValue("Blocked");

  await page.getByRole("button", { name: "Delete column Blocked" }).click();
  await expect(columns(page)).toHaveCount(3);
  await page.reload();
  await expect(columns(page)).toHaveCount(3);
});
