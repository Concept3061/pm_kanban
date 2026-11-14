import { expect, test } from "@playwright/test";
import { initialData, type BoardData } from "../src/lib/kanban";
import { startSignedIn } from "./helpers";

// The chat route is mocked so these tests do not depend on the model. The real
// model is covered by the backend's live tests.
const boardWithNewCard: BoardData = {
  columns: initialData.columns.map((column) =>
    column.id === "col-review"
      ? { ...column, cardIds: [...column.cardIds, "card-ai-1"] }
      : column
  ),
  cards: {
    ...initialData.cards,
    "card-ai-1": {
      id: "card-ai-1",
      title: "From the AI",
      details: "",
      priority: "none",
      dueDate: "",
      assignee: "",
    },
  },
};

test.beforeEach(async ({ page }) => {
  await startSignedIn(page);
  await page.getByRole("button", { name: "AI Assistant" }).click();
});

test("opens and closes the sidebar", async ({ page }) => {
  const sidebar = page.getByRole("complementary", { name: "AI assistant" });
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("button", { name: "Close" }).click();
  await expect(sidebar).toBeHidden();
});

test("refreshes the board when the AI updates it", async ({ page }) => {
  await page.route("**/api/boards/1/chat", (route) =>
    route.fulfill({ json: { reply: "Added it.", board: boardWithNewCard } })
  );
  await page.getByLabel("Message the assistant").fill("Add a card");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Added it.")).toBeVisible();
  await expect(
    page.getByTestId("column-col-review").getByText("From the AI")
  ).toBeVisible();
});

test("sends history and leaves the board alone for a plain reply", async ({ page }) => {
  const bodies: unknown[] = [];
  await page.route("**/api/boards/1/chat", (route) => {
    bodies.push(route.request().postDataJSON());
    route.fulfill({ json: { reply: `Reply ${bodies.length}`, board: null } });
  });
  const input = page.getByLabel("Message the assistant");
  await input.fill("First");
  await input.press("Enter");
  await expect(page.getByText("Reply 1")).toBeVisible();
  await input.fill("Second");
  await input.press("Enter");
  await expect(page.getByText("Reply 2")).toBeVisible();

  expect(bodies[1]).toEqual({
    message: "Second",
    history: [
      { role: "user", content: "First" },
      { role: "assistant", content: "Reply 1" },
    ],
  });
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(8);
});

test("shows an error and restores the message when the AI fails", async ({ page }) => {
  await page.route("**/api/boards/1/chat", (route) =>
    route.fulfill({ status: 502, json: { detail: "The AI request failed" } })
  );
  const input = page.getByLabel("Message the assistant");
  await input.fill("Hello");
  await input.press("Enter");

  await expect(page.getByText("The assistant could not respond. Please try again.")).toBeVisible();
  await expect(input).toHaveValue("Hello");
});

test("keeps the conversation when closed and clears it on reload", async ({ page }) => {
  await page.route("**/api/boards/1/chat", (route) =>
    route.fulfill({ json: { reply: "Remembered", board: null } })
  );
  const sidebar = page.getByRole("complementary", { name: "AI assistant" });
  await page.getByLabel("Message the assistant").fill("Hello");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Remembered")).toBeVisible();

  await sidebar.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "AI Assistant" }).click();
  await expect(page.getByText("Remembered")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "AI Assistant" }).click();
  await expect(page.getByText("Remembered")).toHaveCount(0);
});
