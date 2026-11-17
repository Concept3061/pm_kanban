export const priorities = ["none", "low", "medium", "high"] as const;

export type Priority = (typeof priorities)[number];

export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority;
  // YYYY-MM-DD, or empty for no due date.
  dueDate: string;
  // The username of a board member, or empty.
  assignee: string;
};

export type CardInput = Omit<Card, "id">;

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

const seedCard = (id: string, title: string, details: string): Card => ({
  id,
  title,
  details,
  priority: "none",
  dueDate: "",
  assignee: "",
});

export const initialData: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    {
      id: "col-progress",
      title: "In Progress",
      cardIds: ["card-4", "card-5"],
    },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: Object.fromEntries(
    [
      seedCard(
        "card-1",
        "Align roadmap themes",
        "Draft quarterly themes with impact statements and metrics."
      ),
      seedCard(
        "card-2",
        "Gather customer signals",
        "Review support tags, sales notes, and churn feedback."
      ),
      seedCard(
        "card-3",
        "Prototype analytics view",
        "Sketch initial dashboard layout and key drill-downs."
      ),
      seedCard(
        "card-4",
        "Refine status language",
        "Standardize column labels and tone across the board."
      ),
      seedCard(
        "card-5",
        "Design card layout",
        "Add hierarchy and spacing for scanning dense lists."
      ),
      seedCard(
        "card-6",
        "QA micro-interactions",
        "Verify hover, focus, and loading states."
      ),
      seedCard(
        "card-7",
        "Ship marketing page",
        "Final copy approved and asset pack delivered."
      ),
      seedCard(
        "card-8",
        "Close onboarding sprint",
        "Document release notes and share internally."
      ),
    ].map((card) => [card.id, card])
  ),
};

// A column id finds that column; a card id finds the column holding the card.
const findColumn = (columns: Column[], id: string) =>
  columns.find((column) => column.id === id) ??
  columns.find((column) => column.cardIds.includes(id));

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string,
  // Dropping on a card in another column: put the card after it instead of before.
  placeAfter = false
): Column[] => {
  const activeColumn = findColumn(columns, activeId);
  const overColumn = findColumn(columns, overId);
  if (!activeColumn || !overColumn) {
    return columns;
  }
  const isOverColumn = overColumn.id === overId;

  if (activeColumn.id === overColumn.id) {
    let cardIds: string[];
    if (isOverColumn) {
      cardIds = [
        ...activeColumn.cardIds.filter((cardId) => cardId !== activeId),
        activeId,
      ];
    } else {
      const oldIndex = activeColumn.cardIds.indexOf(activeId);
      const newIndex = activeColumn.cardIds.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return columns;
      }
      cardIds = activeColumn.cardIds
        .toSpliced(oldIndex, 1)
        .toSpliced(newIndex, 0, activeId);
    }
    return columns.map((column) =>
      column.id === activeColumn.id ? { ...column, cardIds } : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }
  const insertIndex = isOverColumn
    ? overColumn.cardIds.length
    : overColumn.cardIds.indexOf(overId) + (placeAfter ? 1 : 0);

  return columns.map((column) => {
    if (column.id === activeColumn.id) {
      return { ...column, cardIds: column.cardIds.toSpliced(activeIndex, 1) };
    }
    if (column.id === overColumn.id) {
      return {
        ...column,
        cardIds: column.cardIds.toSpliced(insertIndex, 0, activeId),
      };
    }
    return column;
  });
};

export const createId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}-${randomPart}${timePart}`;
};

// Compares calendar days as strings, which sort correctly in YYYY-MM-DD form.
export const isOverdue = (dueDate: string, today: Date = new Date()) => {
  if (!dueDate) {
    return false;
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  const todayText = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return dueDate < todayText;
};

export type CardFilter = {
  text: string;
  priority: Priority | "any";
  overdueOnly: boolean;
  // Only cards assigned to this username; empty for everyone.
  assignee: string;
};

export const noFilter: CardFilter = {
  text: "",
  priority: "any",
  overdueOnly: false,
  assignee: "",
};

export const isFiltering = (filter: CardFilter) =>
  filter.text.trim() !== "" ||
  filter.priority !== "any" ||
  filter.overdueOnly ||
  filter.assignee !== "";

export const matchesFilter = (card: Card, filter: CardFilter, today?: Date) => {
  const text = filter.text.trim().toLowerCase();
  if (
    text &&
    !card.title.toLowerCase().includes(text) &&
    !card.details.toLowerCase().includes(text)
  ) {
    return false;
  }
  if (filter.priority !== "any" && card.priority !== filter.priority) {
    return false;
  }
  if (filter.assignee && card.assignee !== filter.assignee) {
    return false;
  }
  return !filter.overdueOnly || isOverdue(card.dueDate, today);
};
