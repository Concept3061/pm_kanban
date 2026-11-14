import { expect, test, type Browser, type Page } from "@playwright/test";

const baseURL = "http://127.0.0.1:8001";

const columns = (page: Page) => page.locator('[data-testid^="column-"]');
const nav = (page: Page) => page.getByRole("navigation", { name: "Boards" });

const newUser = async (browser: Browser, username: string) => {
  const page = await browser.newPage({ baseURL });
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("password1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(columns(page).first()).toBeVisible();
  return page;
};

const addCard = async (page: Page, title: string) => {
  await page.getByRole("button", { name: "Add a card" }).first().click();
  await page.getByPlaceholder("Card title").fill(title);
  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByText(title)).toBeVisible();
};

const openComments = (page: Page, title: string, count: number) =>
  page.getByRole("button", { name: `Comments (${count}) on ${title}` }).click();

test("a user comments on a card, and the comment and count persist", async ({ browser }) => {
  const page = await newUser(browser, `com${Date.now()}`);
  await addCard(page, "Discuss me");
  await openComments(page, "Discuss me", 0);
  await expect(page.getByText("No comments yet.")).toBeVisible();

  await page.getByLabel("Add a comment").fill("First thoughts");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByRole("list", { name: "Comments" }).getByText("First thoughts")).toBeVisible();
  await expect(page.getByRole("button", { name: "Comments (1) on Discuss me" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Comments (1) on Discuss me" })).toBeVisible();
  await openComments(page, "Discuss me", 1);
  await expect(page.getByText("First thoughts")).toBeVisible();

  await page.getByRole("button", { name: /^Delete comment by com/ }).click();
  await expect(page.getByText("First thoughts")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Comments (0) on Discuss me" })).toBeVisible();
  await page.close();
});

test("members see each other's comments; viewers cannot comment; the owner can delete any", async ({ browser }) => {
  const stamp = Date.now();
  const owner = await newUser(browser, `cown${stamp}`);
  const editor = await newUser(browser, `ced${stamp}`);
  const viewer = await newUser(browser, `cvw${stamp}`);
  await addCard(owner, "Shared thread");

  await owner.getByRole("button", { name: "Share", exact: true }).click();
  for (const [name, access] of [
    [`ced${stamp}`, "Editor"],
    [`cvw${stamp}`, "Viewer"],
  ]) {
    await owner.getByLabel("Username").fill(name);
    await owner.getByLabel("Access").selectOption(access);
    await owner.getByRole("button", { name: "Add person" }).click();
    await expect(owner.getByRole("list", { name: "Members" }).getByText(name)).toBeVisible();
  }

  await editor.reload();
  await nav(editor).getByRole("button", { name: `My Board (cown${stamp})` }).click();
  await openComments(editor, "Shared thread", 0);
  await editor.getByLabel("Add a comment").fill("Editor says hi");
  await editor.getByRole("button", { name: "Post" }).click();
  await expect(editor.getByText("Editor says hi")).toBeVisible();

  await viewer.reload();
  await nav(viewer).getByRole("button", { name: `My Board (cown${stamp})` }).click();
  await openComments(viewer, "Shared thread", 1);
  await expect(viewer.getByText("Editor says hi")).toBeVisible();
  await expect(viewer.getByLabel("Add a comment")).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: /^Delete comment/ })).toHaveCount(0);

  // The owner sees the editor's comment and can remove it.
  await owner.reload();
  await openComments(owner, "Shared thread", 1);
  await owner.getByRole("button", { name: `Delete comment by ced${stamp}` }).click();
  await expect(owner.getByText("Editor says hi")).toHaveCount(0);

  await owner.close();
  await editor.close();
  await viewer.close();
});
