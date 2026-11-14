import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { CardFieldInputs } from "@/components/CardFieldInputs";
import { isOverdue, type Card, type CardInput } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  readOnly: boolean;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, input: CardInput) => void;
};

const actionClass =
  "rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]";

export const KanbanCard = ({
  card,
  readOnly,
  onDelete,
  onEdit,
}: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState(card.priority);
  const [dueDate, setDueDate] = useState(card.dueDate);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled: isEditing || readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setTitle(card.title);
    setDetails(card.details);
    setPriority(card.priority);
    setDueDate(card.dueDate);
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onEdit(card.id, {
      title: title.trim(),
      details: details.trim(),
      priority,
      dueDate,
    });
    setIsEditing(false);
  };

  return (
    <article
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      // While editing, these would mark the form inside as a disabled button.
      {...(isEditing || readOnly ? {} : { ...attributes, ...listeners })}
      // The drag attributes mark the card as a button, which may not contain the edit and delete buttons.
      role="group"
      aria-label={card.title}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Edit title"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            aria-label="Edit details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <CardFieldInputs
            priority={priority}
            dueDate={dueDate}
            onChange={(changes) => {
              if (changes.priority !== undefined) {
                setPriority(changes.priority);
              }
              if (changes.dueDate !== undefined) {
                setDueDate(changes.dueDate);
              }
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <h4 className="break-words font-display text-base font-semibold text-[var(--navy-dark)]">
            {card.title}
          </h4>
          <p className="mt-2 break-words text-sm leading-6 text-[var(--gray-text)]">
            {card.details}
          </p>
          {(card.priority !== "none" || card.dueDate) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
              {card.priority !== "none" && (
                <span
                  data-testid={`priority-${card.id}`}
                  className={clsx(
                    "rounded-full px-2 py-1 uppercase tracking-wide",
                    card.priority === "high" && "bg-[var(--secondary-purple)] text-white",
                    card.priority === "medium" && "bg-[var(--accent-yellow)] text-[var(--navy-dark)]",
                    card.priority === "low" && "bg-[var(--primary-blue-text)] text-white"
                  )}
                >
                  {card.priority}
                </span>
              )}
              {card.dueDate && (
                <span
                  data-testid={`due-${card.id}`}
                  className={
                    isOverdue(card.dueDate)
                      ? "text-[var(--secondary-purple)]"
                      : "text-[var(--gray-text)]"
                  }
                >
                  {isOverdue(card.dueDate) ? "Overdue: " : "Due "}
                  {card.dueDate}
                </span>
              )}
            </div>
          )}
          {!readOnly && (
          <div className="mt-3 flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={startEditing}
              className={actionClass}
              aria-label={`Edit ${card.title}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className={actionClass}
              aria-label={`Delete ${card.title}`}
            >
              Delete
            </button>
          </div>
          )}
        </>
      )}
    </article>
  );
};
