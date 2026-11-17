import { useEffect, useState, type ReactNode } from "react";
import { listActivity, type ActivityEntry } from "@/lib/api";

type ActivityLogProps = {
  boardId: number;
};

const buttonClass =
  "rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]";

export const ActivityLog = ({ boardId }: ActivityLogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  // null while loading.
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bumped by the Refresh button to fetch again.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let cancelled = false;
    listActivity(boardId)
      .then((list) => {
        if (!cancelled) {
          setEntries(list);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load the activity.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, boardId, reloads]);

  let content: ReactNode;
  if (error) {
    content = (
      <p role="alert" className="text-sm font-medium text-[var(--secondary-purple)]">
        {error}
      </p>
    );
  } else if (entries === null) {
    content = (
      <p role="status" className="text-sm text-[var(--gray-text)]">
        Loading...
      </p>
    );
  } else if (entries.length === 0) {
    content = <p className="text-sm text-[var(--gray-text)]">No changes yet.</p>;
  } else {
    content = (
      <ul aria-label="Activity" className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {entries.map((entry, index) => (
          <li key={index} className="text-sm text-[var(--navy-dark)]">
            <span className="font-semibold">
              {entry.username ?? "A deleted user"}
              {entry.viaAi && " (via AI)"}
            </span>{" "}
            {entry.message}
            <time
              dateTime={entry.createdAt}
              className="ml-2 text-xs text-[var(--gray-text)]"
            >
              {new Date(entry.createdAt).toLocaleString()}
            </time>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={`${buttonClass} self-start`}
      >
        Activity
      </button>
      {isOpen && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
              Recent activity
            </h2>
            <button type="button" onClick={() => setReloads(reloads + 1)} className={buttonClass}>
              Refresh
            </button>
          </div>
          {content}
        </div>
      )}
    </div>
  );
};
