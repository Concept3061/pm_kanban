import type { Page } from "@playwright/test";
import { initialData } from "../src/lib/kanban";

// Signs in through the API, which shares cookies with the page, and restores the seed board.
export const startSignedIn = async (page: Page) => {
  await page.request.post("/api/auth/login", {
    data: { username: "user", password: "password" },
  });
  await page.request.put("/api/board", { data: initialData });
  await page.goto("/");
};

export const dragCardToColumn = async (
  page: Page,
  cardTestId: string,
  columnTestId: string
) => {
  const cardBox = await page.getByTestId(cardTestId).boundingBox();
  const columnBox = await page.getByTestId(columnTestId).boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 120, {
    steps: 12,
  });
  await page.mouse.up();
};

// Waits for the next successful board save, then returns it.
export const nextSave = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/board") &&
      response.request().method() === "PUT" &&
      response.ok()
  );
