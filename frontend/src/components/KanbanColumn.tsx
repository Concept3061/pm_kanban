import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, CardInput, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  canDelete: boolean;
  readOnly: boolean;
  isFiltering: boolean;
  onRename: (columnId: string, title: string) => void;
  onDelete: (columnId: string) => void;
  onAddCard: (columnId: string, input: CardInput) => void;
  onEditCard: (cardId: string, input: CardInput) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  canDelete,
  readOnly,
  isFiltering,
  onRename,
  onDelete,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              {isFiltering
                ? `${cards.length} of ${column.cardIds.length}`
                : cards.length}{" "}
              cards
            </span>
            {canDelete && !readOnly && (
              <button
                type="button"
                onClick={() => onDelete(column.id)}
                aria-label={`Delete column ${column.title}`}
                className="ml-auto text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                Delete
              </button>
            )}
          </div>
          {/* Saved on blur. The key resets the input if the title changes elsewhere, such as from the AI. */}
          <input
            key={column.title}
            defaultValue={column.title}
            readOnly={readOnly}
            onBlur={(event) => {
              const title = event.target.value.trim();
              if (!title) {
                event.target.value = column.title;
              } else if (title !== column.title) {
                onRename(column.id, title);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-blue-text)]"
            aria-label="Column title"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              readOnly={readOnly}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {isFiltering ? "No matching cards" : "Drop a card here"}
          </div>
        )}
      </div>
      {!readOnly && (
        <NewCardForm onAdd={(input) => onAddCard(column.id, input)} />
      )}
    </section>
  );
};
