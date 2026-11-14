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

const share = async (owner: Page, username: string, access: "Editor" | "Viewer") => {
  // The panel may already be open from an earlier step.
  if (!(await owner.getByRole("list", { name: "Members" }).isVisible())) {
    await owner.getByRole("button", { name: "Share", exact: true }).click();
  }
  await owner.getByLabel("Username").fill(username);
  await owner.getByLabel("Access").selectOption(access);
  await owner.getByRole("button", { name: "Add person" }).click();
  await expect(owner.getByRole("list", { name: "Members" }).getByText(username)).toBeVisible();
};

test("an owner shares a board with an editor, who can change it and then leave", async ({ browser }) => {
  const stamp = Date.now();
  const owner = await newUser(browser, `own${stamp}`);
  const editor = await newUser(browser, `edit${stamp}`);

  await owner.getByRole("button", { name: "Add a card" }).first().click();
  await owner.getByPlaceholder("Card title").fill("Shared card");
  await owner.getByRole("button", { name: "Add card" }).click();
  await expect(owner.getByText("Shared card")).toBeVisible();

  await share(owner, `edit${stamp}`, "Editor");

  await editor.reload();
  await nav(editor).getByRole("button", { name: `My Board (own${stamp})` }).click();
  await expect(editor.getByText("Shared card")).toBeVisible();
  await expect(editor.getByRole("button", { name: "AI Assistant" })).toBeVisible();
  await expect(editor.getByText("View only")).toHaveCount(0);

  // The editor adds a card; the owner sees it after a reload.
  await editor.getByRole("button", { name: "Add a card" }).first().click();
  await editor.getByPlaceholder("Card title").fill("Editor card");
  const saved = editor.waitForResponse(
    (response) => response.request().method() === "PUT" && response.ok()
  );
  await editor.getByRole("button", { name: "Add card" }).click();
  await saved;
  await owner.reload();
  await expect(owner.getByText("Editor card")).toBeVisible();

  // The editor cannot manage the board.
  await expect(editor.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Rename board" })).toHaveCount(0);

  editor.once("dialog", (dialog) => dialog.accept());
  await editor.getByRole("button", { name: "Leave board" }).click();
  await expect(nav(editor).getByRole("button", { name: `My Board (own${stamp})` })).toHaveCount(0);

  await owner.close();
  await editor.close();
});

test("a viewer sees the board but cannot change it", async ({ browser }) => {
  const stamp = Date.now();
  const owner = await newUser(browser, `own${stamp}`);
  const viewer = await newUser(browser, `view${stamp}`);
  await share(owner, `view${stamp}`, "Viewer");

  await viewer.reload();
  await nav(viewer).getByRole("button", { name: `My Board (own${stamp})` }).click();
  await expect(viewer.getByText("View only")).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Add a card" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Add column" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "AI Assistant" })).toHaveCount(0);

  const id = (await (await owner.request.get("/api/boards")).json())[0].id;
  const board = await (await viewer.request.get(`/api/boards/${id}`)).json();
  expect((await viewer.request.put(`/api/boards/${id}`, { data: board })).status()).toBe(403);

  // Promoting the viewer to editor takes effect without re-sharing.
  await owner.getByLabel(`Role of view${stamp}`).selectOption("editor");
  await expect
    .poll(async () => (await viewer.request.put(`/api/boards/${id}`, { data: board })).status())
    .toBe(200);

  await owner.close();
  await viewer.close();
});

test("sharing with an unknown user shows an error, and removing a member revokes access", async ({ browser }) => {
  const stamp = Date.now();
  const owner = await newUser(browser, `own${stamp}`);
  const member = await newUser(browser, `mem${stamp}`);

  await owner.getByRole("button", { name: "Share", exact: true }).click();
  await owner.getByLabel("Username").fill(`nobody${stamp}`);
  await owner.getByRole("button", { name: "Add person" }).click();
  await expect(owner.getByText("No user with that username.")).toBeVisible();

  await share(owner, `mem${stamp}`, "Editor");
  const id = (await (await owner.request.get("/api/boards")).json())[0].id;
  expect((await member.request.get(`/api/boards/${id}`)).status()).toBe(200);
  await owner.getByRole("button", { name: `Remove mem${stamp}` }).click();
  await expect(owner.getByRole("list", { name: "Members" }).getByText(`mem${stamp}`)).toHaveCount(0);
  expect((await member.request.get(`/api/boards/${id}`)).status()).toBe(404);

  await owner.close();
  await member.close();
});
