import { useEffect, useState } from "react";
import { getOverview, isUnauthorized, type OverviewData } from "@/lib/api";

type OverviewProps = {
  onOpenBoard: (id: number) => void;
  onClose: () => void;
  onSignedOut: () => void;
};

const tileClass =
  "rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4";

export const Overview = ({ onOpenBoard, onClose, onSignedOut }: OverviewProps) => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOverview()
      .then(setData)
      .catch((err) => {
        if (isUnauthorized(err)) {
          onSignedOut();
        } else {
          setError("Could not load the overview.");
        }
      });
  }, [onSignedOut]);

  const tiles = data && [
    ["Boards", data.totals.boards],
    ["Cards", data.totals.cards],
    ["Overdue", data.totals.overdue],
    ["High priority", data.totals.highPriority],
  ] as const;

  return (
    <main className="mx-auto flex min-h-screen max-w-[1100px] flex-col gap-8 px-6 pb-16 pt-12">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)]">
        <div>
          <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
          <h1 className="mt-4 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Overview
          </h1>
          <p className="mt-2 text-sm text-[var(--gray-text)]">
            Every board you can open, at a glance.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Back to boards
        </button>
      </header>

      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--secondary-purple)]">
          {error}
        </p>
      )}
      {!data && !error && (
        <p role="status" className="text-sm font-semibold text-[var(--gray-text)]">
          Loading the overview...
        </p>
      )}

      {data && tiles && (
        <>
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {tiles.map(([label, value]) => (
              <div key={label} className={tileClass}>
                <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  {label}
                </dt>
                <dd className="mt-2 font-display text-3xl font-semibold text-[var(--primary-blue-text)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <ul aria-label="Boards" className="flex flex-col gap-4">
            {data.boards.map((board) => (
              <li
                key={board.id}
                className="rounded-3xl border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">
                      {board.name}
                    </h2>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                      {board.role === "owner" ? "Owned by you" : `${board.role} - ${board.owner}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenBoard(board.id)}
                    aria-label={`Open ${board.name}`}
                    className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                  >
                    Open
                  </button>
                </div>
                <p className="mt-3 text-sm text-[var(--navy-dark)]">
                  {board.cards} cards, {board.overdue} overdue, {board.highPriority} high priority
                </p>
                <ul aria-label={`${board.name} columns`} className="mt-4 flex flex-col gap-2">
                  {board.columns.map((column, index) => (
                    <li key={index} className="flex items-center gap-3 text-xs text-[var(--gray-text)]">
                      <span className="w-28 shrink-0 truncate font-semibold">{column.title}</span>
                      <span
                        aria-hidden
                        className="h-2 rounded-full bg-[var(--primary-blue)]"
                        style={{
                          width: `${board.cards ? (column.count / board.cards) * 100 : 0}%`,
                          minWidth: column.count ? "0.5rem" : 0,
                        }}
                      />
                      <span>{column.count}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
};
