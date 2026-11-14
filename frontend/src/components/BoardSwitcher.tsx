import { useState, type FormEvent } from "react";
import clsx from "clsx";
import type { BoardSummary } from "@/lib/api";

type BoardSwitcherProps = {
  boards: BoardSummary[];
  activeId: number;
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
};

const buttonClass =
  "rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]";

const inputClass =
  "rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

export const BoardSwitcher = ({
  boards,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: BoardSwitcherProps) => {
  // Which name form is open: adding a board, or renaming the active one.
  const [mode, setMode] = useState<"create" | "rename" | null>(null);
  const [name, setName] = useState("");
  const active = boards.find((board) => board.id === activeId);
  const isOwner = active?.role === "owner";
  const ownedCount = boards.filter((board) => board.role === "owner").length;

  const open = (next: "create" | "rename") => {
    setName(next === "rename" ? (active?.name ?? "") : "");
    setMode(next);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      if (mode === "create") {
        onCreate(trimmed);
      } else {
        onRename(activeId, trimmed);
      }
    }
    setMode(null);
  };

  const handleDelete = () => {
    if (active && window.confirm(`Delete "${active.name}" and all its cards?`)) {
      onDelete(activeId);
    }
  };

  return (
    <nav aria-label="Boards" className="flex flex-wrap items-center gap-3">
      {boards.map((board) => (
        <button
          key={board.id}
          type="button"
          aria-pressed={board.id === activeId}
          onClick={() => onSelect(board.id)}
          className={clsx(
            "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition",
            board.id === activeId
              ? "bg-[var(--primary-blue-text)] text-white"
              : "border border-[var(--stroke)] text-[var(--navy-dark)] hover:border-[var(--primary-blue)]"
          )}
        >
          {board.role === "owner" ? board.name : `${board.name} (${board.owner})`}
        </button>
      ))}
      {mode ? (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            autoFocus
            aria-label="Board name"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
          <button
            type="submit"
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Save
          </button>
          <button type="button" onClick={() => setMode(null)} className={buttonClass}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button type="button" onClick={() => open("create")} className={buttonClass}>
            New board
          </button>
          {isOwner && (
            <button type="button" onClick={() => open("rename")} className={buttonClass}>
              Rename board
            </button>
          )}
          {isOwner && ownedCount > 1 && (
            <button type="button" onClick={handleDelete} className={buttonClass}>
              Delete board
            </button>
          )}
        </>
      )}
    </nav>
  );
};
