import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  listMembers,
  shareBoard,
  unshareBoard,
  type Member,
  type ShareRole,
} from "@/lib/api";

type ShareBoardProps = {
  boardId: number;
  // The signed-in user's role on this board.
  isOwner: boolean;
  onLeave: () => void;
};

const buttonClass =
  "rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]";

const fieldClass =
  "rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

const failureMessage = (err: unknown) => {
  if (err instanceof ApiError && err.status === 404) {
    return "No user with that username.";
  }
  if (err instanceof ApiError && err.status === 409) {
    return "You already own this board.";
  }
  return "Could not update sharing. Please try again.";
};

export const ShareBoard = ({ boardId, isOwner, onLeave }: ShareBoardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    listMembers(boardId)
      .then(setMembers)
      .catch(() => setError("Could not load the members."));
  }, [isOpen, boardId]);

  if (!isOwner) {
    return (
      <button
        type="button"
        onClick={() => {
          if (window.confirm("Leave this board? You will lose access to it.")) {
            onLeave();
          }
        }}
        className={`${buttonClass} self-start`}
      >
        Leave board
      </button>
    );
  }

  const refresh = async () => setMembers(await listMembers(boardId));

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(failureMessage(err));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = username.trim();
    if (!name) {
      return;
    }
    await run(() => shareBoard(boardId, name, role));
    setUsername("");
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={`${buttonClass} self-start`}
      >
        Share
      </button>
      {isOpen && (
        <div className="flex flex-col gap-4 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-5">
          <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
            Who can access this board
          </h2>
          <ul aria-label="Members" className="flex flex-col gap-2">
            {members.map((member) => (
              <li
                key={member.username}
                className="flex flex-wrap items-center gap-3 text-sm text-[var(--navy-dark)]"
              >
                <span className="font-semibold">{member.username}</span>
                {member.role === "owner" ? (
                  <span className="text-xs uppercase tracking-wide text-[var(--gray-text)]">
                    Owner
                  </span>
                ) : (
                  <>
                    <select
                      aria-label={`Role of ${member.username}`}
                      value={member.role}
                      onChange={(event) =>
                        run(() =>
                          shareBoard(
                            boardId,
                            member.username,
                            event.target.value as ShareRole
                          )
                        )
                      }
                      className={fieldClass}
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        run(() => unshareBoard(boardId, member.username))
                      }
                      aria-label={`Remove ${member.username}`}
                      className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                    >
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--gray-text)]">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className={`${fieldClass} mt-1 block`}
                required
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--gray-text)]">
              Access
              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as ShareRole)
                }
                className={`${fieldClass} mt-1 block`}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Add person
            </button>
          </form>
          {error && (
            <p role="alert" className="text-sm font-medium text-[var(--secondary-purple)]">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
