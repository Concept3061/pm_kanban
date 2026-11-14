import {
  isFiltering,
  isOverdue,
  matchesFilter,
  moveCard,
  noFilter,
  type Card,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("isOverdue", () => {
  const today = new Date(2030, 5, 15);

  it("is true only for days before today", () => {
    expect(isOverdue("2030-06-14", today)).toBe(true);
    expect(isOverdue("2029-12-31", today)).toBe(true);
    expect(isOverdue("2030-06-15", today)).toBe(false);
    expect(isOverdue("2030-06-16", today)).toBe(false);
  });

  it("is false without a due date", () => {
    expect(isOverdue("", today)).toBe(false);
  });
});

describe("matchesFilter", () => {
  const today = new Date(2030, 5, 15);
  const card: Card = {
    id: "c",
    title: "Write Report",
    details: "Quarterly numbers",
    priority: "high",
    dueDate: "2030-06-01",
    assignee: "pat",
  };

  it("matches everything with no filter", () => {
    expect(matchesFilter(card, noFilter, today)).toBe(true);
    expect(isFiltering(noFilter)).toBe(false);
  });

  it("searches title and details, ignoring case and surrounding spaces", () => {
    expect(matchesFilter(card, { ...noFilter, text: " report " }, today)).toBe(true);
    expect(matchesFilter(card, { ...noFilter, text: "QUARTERLY" }, today)).toBe(true);
    expect(matchesFilter(card, { ...noFilter, text: "budget" }, today)).toBe(false);
  });

  it("filters by priority", () => {
    expect(matchesFilter(card, { ...noFilter, priority: "high" }, today)).toBe(true);
    expect(matchesFilter(card, { ...noFilter, priority: "low" }, today)).toBe(false);
  });

  it("filters to overdue cards", () => {
    const filter = { ...noFilter, overdueOnly: true };
    expect(matchesFilter(card, filter, today)).toBe(true);
    expect(matchesFilter({ ...card, dueDate: "2030-07-01" }, filter, today)).toBe(false);
    expect(matchesFilter({ ...card, dueDate: "" }, filter, today)).toBe(false);
  });

  it("requires every condition", () => {
    const filter = {
      ...noFilter,
      text: "report",
      priority: "low" as const,
      overdueOnly: true,
    };
    expect(matchesFilter(card, filter, today)).toBe(false);
    expect(isFiltering(filter)).toBe(true);
  });

  it("filters by assignee", () => {
    expect(matchesFilter(card, { ...noFilter, assignee: "pat" }, today)).toBe(true);
    expect(matchesFilter(card, { ...noFilter, assignee: "sam" }, today)).toBe(false);
    expect(matchesFilter({ ...card, assignee: "" }, { ...noFilter, assignee: "pat" }, today)).toBe(false);
    expect(isFiltering({ ...noFilter, assignee: "pat" })).toBe(true);
  });

  it("treats blank search text as no filter", () => {
    expect(isFiltering({ ...noFilter, text: "   " })).toBe(false);
  });
});

describe("moveCard into another column", () => {
  const columns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1"] },
    { id: "col-b", title: "B", cardIds: ["card-2", "card-3"] },
  ];

  it("inserts before the card it is dropped on by default", () => {
    expect(moveCard(columns, "card-1", "card-2")[1].cardIds).toEqual(["card-1", "card-2", "card-3"]);
  });

  it("inserts after the card when asked to", () => {
    expect(moveCard(columns, "card-1", "card-2", true)[1].cardIds).toEqual(["card-2", "card-1", "card-3"]);
    expect(moveCard(columns, "card-1", "card-3", true)[1].cardIds).toEqual(["card-2", "card-3", "card-1"]);
  });

  it("appends when dropped on the column itself, with or without placeAfter", () => {
    expect(moveCard(columns, "card-1", "col-b")[1].cardIds).toEqual(["card-2", "card-3", "card-1"]);
    expect(moveCard(columns, "card-1", "col-b", true)[1].cardIds).toEqual(["card-2", "card-3", "card-1"]);
  });

  it("ignores placeAfter within a column", () => {
    expect(moveCard(columns, "card-2", "card-3", true)[1].cardIds).toEqual(["card-3", "card-2"]);
  });
});
