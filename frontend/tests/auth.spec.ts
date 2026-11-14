import { expect, test } from "@playwright/test";

const signIn = async (
  page: import("@playwright/test").Page,
  username: string,
  password: string
) => {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
};

test("requires signing in before showing the board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("rejects wrong credentials", async ({ page }) => {
  await page.goto("/");
  await signIn(page, "user", "wrong");
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("signs in, stays signed in after reload, and logs out", async ({ page }) => {
  await page.goto("/");
  await signIn(page, "user", "password");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.reload();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect((await page.request.get("/api/boards/1")).status()).toBe(401);
});

test("the API rejects requests without a session", async ({ request }) => {
  expect((await request.get("/api/boards/1")).status()).toBe(401);
  expect((await request.post("/api/boards/1/chat", { data: { message: "Hi" } })).status()).toBe(401);
});

test("the session cookie is not readable from scripts", async ({ page }) => {
  await page.goto("/");
  await signIn(page, "user", "password");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  expect(await page.evaluate(() => document.cookie)).toBe("");
});
