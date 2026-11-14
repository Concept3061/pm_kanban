import { expect, test, type Page } from "@playwright/test";
import { startSignedIn } from "./helpers";

const cardIds = (page: Page, columnId: string) =>
  page
    .getByTestId(`column-${columnId}`)
    .locator('[data-testid^="card-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));

// Presses on the card at (grabX, grabY) as fractions of its size, moves the pointer
// to the target, and releases.
const drag = async (
  page: Page,
  cardTestId: string,
  target: { x: number; y: number },
  grab: { x: number; y: number } = { x: 0.5, y: 0.5 }
) => {
  const box = await page.getByTestId(cardTestId).boundingBox();
  if (!box) {
    throw new Error("Card is not visible.");
  }
  await page.mouse.move(box.x + box.width * grab.x, box.y + box.height * grab.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  // A move is saved right after the drop. Wait for that, or a later reset of the
  // board in the same test can be overwritten by the late save.
  // A drop that changes nothing saves nothing, so give up quickly in that case.
  const saved = page.waitForResponse(
    (response) => response.request().method() === "PUT" && response.url().includes("/api/boards/"),
    { timeout: 2000 }
  );
  await page.mouse.up();
  await saved.catch(() => undefined);
};

const centerOf = async (page: Page, testId: string) => {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) {
    throw new Error("Element is not visible.");
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await startSignedIn(page);
  // The header pushes the columns down; bring them into view.
  await page.getByTestId("column-col-backlog").evaluate((el) => el.scrollIntoView({ block: "start" }));
});

const grabPoints = {
  center: { x: 0.5, y: 0.5 },
  "top left": { x: 0.05, y: 0.1 },
  "top right": { x: 0.95, y: 0.1 },
  "bottom left": { x: 0.05, y: 0.9 },
  "bottom right": { x: 0.95, y: 0.9 },
};

for (const [name, grab] of Object.entries(grabPoints)) {
  test(`a card grabbed at its ${name} lands in the column the pointer is released over`, async ({ page }) => {
    for (const column of ["discovery", "progress", "review", "done"]) {
      await startSignedIn(page);
      await page.getByTestId("column-col-backlog").evaluate((el) => el.scrollIntoView({ block: "start" }));
      const target = await centerOf(page, `column-col-${column}`);
      await drag(page, "card-card-1", target, grab);
      await expect(page.getByTestId(`column-col-${column}`).getByTestId("card-card-1")).toBeVisible();
      await expect(page.getByTestId("column-col-backlog").getByTestId("card-card-1")).toHaveCount(0);
    }
  });
}

test("dropping below the last card of a column puts the card at the end", async ({ page }) => {
  const column = await centerOf(page, "column-col-done");
  await drag(page, "card-card-1", { x: column.x, y: column.box.y + column.box.height - 40 });
  await expect.poll(() => cardIds(page, "col-done")).toEqual(["card-card-7", "card-card-8", "card-card-1"]);
});

test("dropping on the top half of a card puts the card before it, the bottom half after it", async ({ page }) => {
  const target = await centerOf(page, "card-card-7");
  await drag(page, "card-card-1", { x: target.x, y: target.box.y + target.box.height * 0.2 });
  await expect.poll(() => cardIds(page, "col-done")).toEqual(["card-card-1", "card-card-7", "card-card-8"]);

  await startSignedIn(page);
  await page.getByTestId("column-col-backlog").evaluate((el) => el.scrollIntoView({ block: "start" }));
  const again = await centerOf(page, "card-card-7");
  await drag(page, "card-card-1", { x: again.x, y: again.box.y + again.box.height * 0.8 });
  await expect.poll(() => cardIds(page, "col-done")).toEqual(["card-card-7", "card-card-1", "card-card-8"]);
});

test("dropping into an empty column works", async ({ page }) => {
  // Empty the Review column first.
  const board = await (await page.request.get("/api/boards/1")).json();
  board.columns[3].cardIds = [];
  board.columns[0].cardIds.push("card-6");
  await page.request.put("/api/boards/1", { data: board });
  await page.reload();
  await page.getByTestId("column-col-backlog").evaluate((el) => el.scrollIntoView({ block: "start" }));

  const target = await centerOf(page, "column-col-review");
  await drag(page, "card-card-1", target, grabPoints["top left"]);
  await expect.poll(() => cardIds(page, "col-review")).toEqual(["card-card-1"]);
});

test("dropping a card back where it started changes nothing", async ({ page }) => {
  const own = await centerOf(page, "card-card-1");
  await drag(page, "card-card-1", { x: own.x + 5, y: own.y + 5 }, grabPoints["top left"]);
  await expect.poll(() => cardIds(page, "col-backlog")).toEqual(["card-card-1", "card-card-2"]);
});

test("a drag released between columns is dropped on the nearest one", async ({ page }) => {
  const backlog = await centerOf(page, "column-col-backlog");
  const gapX = backlog.box.x + backlog.box.width + 12; // in the gap to the right of Backlog
  await drag(page, "card-card-1", { x: gapX, y: backlog.y });
  const placed = [
    ...(await cardIds(page, "col-backlog")),
    ...(await cardIds(page, "col-discovery")),
  ];
  expect(placed).toContain("card-card-1");
  expect(placed.filter((id) => id === "card-card-1")).toHaveLength(1);
});
