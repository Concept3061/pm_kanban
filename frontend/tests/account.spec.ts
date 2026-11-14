import { expect, test, type Page } from "@playwright/test";

const register = async (page: Page, username: string) => {
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("password1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
};

const signIn = async (page: Page, username: string, password: string) => {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
};

test("a user changes their password and signs in with the new one", async ({ page }) => {
  const username = `pw${Date.now()}`;
  await register(page, username);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByLabel("Current password").fill("password1");
  await page.getByLabel("New password").fill("password2");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/password changed/i)).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, username, "password1");
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await signIn(page, username, "password2");
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
});

test("a wrong current password is rejected", async ({ page }) => {
  await register(page, `bad${Date.now()}`);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByLabel("Current password").fill("nope-nope");
  await page.getByLabel("New password").fill("password2");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("That password is incorrect.")).toBeVisible();
});

test("a user deletes their account", async ({ page }) => {
  const username = `del${Date.now()}`;
  await register(page, username);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByLabel("Confirm with your password").fill("password1");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("form", { name: "Delete account" }).getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await signIn(page, username, "password1");
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
});
