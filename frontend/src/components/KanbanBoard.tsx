"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import clsx from "clsx";
import { ChatSidebar } from "@/components/ChatSidebar";
import { CommentsContext } from "@/components/CommentsContext";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { pointerCollision } from "@/lib/dragCollision";
import {
  getBoard,
  getCommentCounts,
  isUnauthorized,
  listMembers,
  logout,
  saveBoard,
  sendChat,
  type ChatMessage,
} from "@/lib/api";
import {
  createId,
  isFiltering,
  matchesFilter,
  moveCard,
  noFilter,
  priorities,
  type BoardData,
  type CardFilter,
  type CardInput,
} from "@/lib/kanban";

type KanbanBoardProps = {
  boardId: number;
  readOnly?: boolean;
  isOwner?: boolean;
  switcher?: ReactNode;
  username: string;
  onSignedOut: () => void;
};

// Cards added or edited here get placeholder details when left empty.
const withDetails = (input: CardInput): CardInput => ({
  ...input,
  details: input.details || "No details yet.",
});

export const KanbanBoard = ({
  boardId,
  readOnly = false,
  isOwner = false,
  switcher,
  username,
  onSignedOut,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [filter, setFilter] = useState<CardFilter>(noFilter);
  // Usernames cards can be assigned to; empty until loaded.
  const [members, setMembers] = useState<string[]>([]);
  // Latest pointer height while dragging, to tell the top half of a card from the bottom.
  const pointerY = useRef<number | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  // Saves run one at a time so an older board can never overwrite a newer one.
  const pendingSaves = useRef<Promise<void>>(Promise.resolve());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    getBoard(boardId)
      .then(setBoard)
      .catch((err) => {
        if (isUnauthorized(err)) {
          onSignedOut();
        } else {
          setError("Could not load your board. Please reload the page.");
        }
      });
  }, [boardId, onSignedOut]);

  useEffect(() => {
    listMembers(boardId)
      .then((list) => setMembers(list.map((member) => member.username)))
      .catch(() => setMembers([]));
  }, [boardId]);

  useEffect(() => {
    getCommentCounts(boardId)
      .then(setCommentCounts)
      .catch(() => setCommentCounts({}));
  }, [boardId]);

  const handleCommentCount = (cardId: string, count: number) =>
    setCommentCounts((counts) => ({ ...counts, [cardId]: count }));

  const updateBoard = (next: BoardData) => {
    setBoard(next);
    pendingSaves.current = pendingSaves.current.then(async () => {
      try {
        await saveBoard(boardId, next);
        setError(null);
      } catch (err) {
        if (isUnauthorized(err)) {
          onSignedOut();
        } else {
          setError("Your last change could not be saved.");
        }
      }
    });
  };

  const handleLogout = async () => {
    await pendingSaves.current;
    await logout();
    onSignedOut();
  };

  const handleChat = async (message: string, history: ChatMessage[]) => {
    // The AI must see the latest board, including changes still being saved.
    await pendingSaves.current;
    try {
      const response = await sendChat(boardId, message, history);
      if (response.board) {
        setBoard(response.board);
      }
      return response.reply;
    } catch (err) {
      if (isUnauthorized(err)) {
        onSignedOut();
      }
      throw err;
    }
  };

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p
          role={error ? "alert" : "status"}
          className="text-sm font-semibold text-[var(--gray-text)]"
        >
          {error ?? "Loading your board..."}
        </p>
      </main>
    );
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
    pointerY.current =
      "clientY" in event.activatorEvent
        ? (event.activatorEvent as PointerEvent).clientY
        : null;
  };

  const handleDragMove = (event: DragMoveEvent) => {
    if ("clientY" in event.activatorEvent) {
      pointerY.current = (event.activatorEvent as PointerEvent).clientY + event.delta.y;
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const isOverCard = !board.columns.some((column) => column.id === over.id);
    const placeAfter =
      isOverCard &&
      pointerY.current !== null &&
      pointerY.current > over.rect.top + over.rect.height / 2;

    updateBoard({
      ...board,
      columns: moveCard(
        board.columns,
        active.id as string,
        over.id as string,
        placeAfter
      ),
    });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    updateBoard({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    });
  };

  const handleAddColumn = () => {
    updateBoard({
      ...board,
      columns: [
        ...board.columns,
        { id: createId("col"), title: "New column", cardIds: [] },
      ],
    });
  };

  const handleDeleteColumn = (columnId: string) => {
    const column = board.columns.find((item) => item.id === columnId);
    if (!column) {
      return;
    }
    if (
      column.cardIds.length > 0 &&
      !window.confirm(
        `Delete "${column.title}" and its ${column.cardIds.length} card(s)?`
      )
    ) {
      return;
    }
    updateBoard({
      columns: board.columns.filter((item) => item.id !== columnId),
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => !column.cardIds.includes(id))
      ),
    });
  };

  const handleAddCard = (columnId: string, input: CardInput) => {
    const id = createId("card");
    updateBoard({
      ...board,
      cards: {
        ...board.cards,
        [id]: { id, ...withDetails(input) },
      },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    });
  };

  const handleEditCard = (cardId: string, input: CardInput) => {
    updateBoard({
      ...board,
      cards: {
        ...board.cards,
        [cardId]: { id: cardId, ...withDetails(input) },
      },
    });
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    updateBoard({
      ...board,
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => id !== cardId)
      ),
      columns: board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    });
  };

  const activeCard = activeCardId ? board.cards[activeCardId] : null;

  return (
    <CommentsContext.Provider
      value={{
        boardId,
        username,
        canComment: !readOnly,
        isOwner,
        counts: commentCounts,
        onCountChange: handleCommentCount,
      }}
    >
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

        <main
          className={clsx(
            "relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12",
            isChatOpen && "sm:pr-[424px]"
          )}
        >
          <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                  Project Boards
                </p>
                <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                  Kanban Studio
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                  Keep momentum visible. Rename columns, drag cards between stages,
                  and capture quick notes without getting buried in settings.
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <span className="text-xs font-semibold text-[var(--gray-text)]">
                    Signed in as {username}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                  >
                    Log out
                  </button>
                  {readOnly ? (
                    <span className="rounded-full bg-[var(--accent-yellow)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)]">
                      View only
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsChatOpen((open) => !open)}
                      aria-expanded={isChatOpen}
                      className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                    >
                      AI Assistant
                    </button>
                  )}
                </div>
                <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                    Focus
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--primary-blue-text)]">
                    Many boards. Zero clutter.
                  </p>
                </div>
              </div>
            </div>
            {switcher}
            <div className="flex flex-wrap items-center gap-4">
              {board.columns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
                >
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                  {column.title}
                </div>
              ))}
            </div>
            <div role="search" className="flex flex-wrap items-center gap-3">
              <input
                type="search"
                aria-label="Search cards"
                placeholder="Search cards"
                value={filter.text}
                onChange={(event) =>
                  setFilter({ ...filter, text: event.target.value })
                }
                className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              />
              <select
                aria-label="Filter by priority"
                value={filter.priority}
                onChange={(event) =>
                  setFilter({
                    ...filter,
                    priority: event.target.value as CardFilter["priority"],
                  })
                }
                className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold capitalize text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              >
                <option value="any">Any priority</option>
                {priorities
                  .filter((priority) => priority !== "none")
                  .map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
              </select>
              <label className="flex items-center gap-2 text-xs font-semibold text-[var(--gray-text)]">
                <input
                  type="checkbox"
                  checked={filter.overdueOnly}
                  onChange={(event) =>
                    setFilter({ ...filter, overdueOnly: event.target.checked })
                  }
                />
                Overdue only
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-[var(--gray-text)]">
                <input
                  type="checkbox"
                  checked={filter.assignee === username}
                  onChange={(event) =>
                    setFilter({
                      ...filter,
                      assignee: event.target.checked ? username : "",
                    })
                  }
                />
                Assigned to me
              </label>
              {isFiltering(filter) && (
                <button
                  type="button"
                  onClick={() => setFilter(noFilter)}
                  className="text-xs font-semibold text-[var(--primary-blue-text)]"
                >
                  Clear filters
                </button>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm font-medium text-[var(--secondary-purple)]">
                {error}
              </p>
            )}
          </header>

          <DndContext
            sensors={sensors}
            collisionDetection={pointerCollision(board.columns.map((column) => column.id))}
            onDragMove={handleDragMove}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section
              className={clsx(
                "-mx-3 grid overflow-x-auto px-3 pb-10",
                "grid-flow-col",
                isChatOpen
                  ? "auto-cols-[minmax(180px,1fr)] gap-3"
                  : "auto-cols-[minmax(220px,1fr)] gap-6"
              )}
            >
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds
                    .map((cardId) => board.cards[cardId])
                    .filter((card) => matchesFilter(card, filter))}
                  isFiltering={isFiltering(filter)}
                  canDelete={board.columns.length > 1}
                  readOnly={readOnly}
                  members={members}
                  onRename={handleRenameColumn}
                  onDelete={handleDeleteColumn}
                  onAddCard={handleAddCard}
                  onEditCard={handleEditCard}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
              {!readOnly && (
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="min-h-[120px] self-start rounded-3xl border border-dashed border-[var(--stroke)] px-4 py-6 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue-text)]"
                >
                  Add column
                </button>
              )}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </main>

        {!readOnly && (
          <ChatSidebar
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            onSend={handleChat}
          />
        )}
      </div>
    </CommentsContext.Provider>
  );
};
