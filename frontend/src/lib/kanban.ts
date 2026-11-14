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
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
      priority: "none",
      dueDate: "",
      assignee: "",
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback.",
      priority: "none",
      dueDate: "",
      assignee: "",
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs.",
      priority: "none",
      dueDate: "",
      assignee: "",
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board.",
      priority: "none",
      dueDate: "",
      assignee: "",
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists.",
      priority: "none",
      dueDate: "",
      assignee: "",
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states.",
      priority: "none",
      dueDate: "",
      assignee: "",
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered.",
      priority: "none",
      dueDate: "",
      assignee: "",
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally.",
      priority: "none",
      dueDate: "",
      assignee: "",
    },
  },
};

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string,
  // Dropping on a card in another column: put the card after it instead of before.
  placeAfter = false
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex =
      overIndex === -1
        ? nextOverCardIds.length
        : overIndex + (placeAfter ? 1 : 0);
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
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
