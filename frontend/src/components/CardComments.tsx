import { useContext, useEffect, useState, type FormEvent } from "react";
import { CommentsContext } from "@/components/CommentsContext";
import {
  addComment,
  deleteComment,
  listComments,
  type Comment,
} from "@/lib/api";

type CardCommentsProps = {
  cardId: string;
};

export const CardComments = ({ cardId }: CardCommentsProps) => {
  const { boardId, username, canComment, isOwner, onCountChange } =
    useContext(CommentsContext);
  // null while loading.
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listComments(boardId, cardId)
      .then((list) => {
        if (!cancelled) {
          setComments(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load the comments.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, cardId]);

  const update = (next: Comment[]) => {
    setComments(next);
    onCountChange(cardId, next.length);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || comments === null) {
      return;
    }
    setError(null);
    try {
      const created = await addComment(boardId, cardId, text);
      update([...comments, created]);
      setBody("");
    } catch {
      setError("Could not post the comment.");
    }
  };

  const handleDelete = async (id: number) => {
    if (comments === null) {
      return;
    }
    setError(null);
    try {
      await deleteComment(boardId, id);
      update(comments.filter((comment) => comment.id !== id));
    } catch {
      setError("Could not delete the comment.");
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-[var(--stroke)] pt-3">
      {comments === null && !error && (
        <p role="status" className="text-xs text-[var(--gray-text)]">
          Loading...
        </p>
      )}
      {comments !== null && comments.length === 0 && (
        <p className="text-xs text-[var(--gray-text)]">No comments yet.</p>
      )}
      {comments !== null && comments.length > 0 && (
        <ul aria-label="Comments" className="flex flex-col gap-2">
          {comments.map((comment) => (
            <li key={comment.id} className="text-sm text-[var(--navy-dark)]">
              <span className="font-semibold">
                {comment.username ?? "A deleted user"}
              </span>
              <time
                dateTime={comment.createdAt}
                className="ml-2 text-xs text-[var(--gray-text)]"
              >
                {new Date(comment.createdAt).toLocaleString()}
              </time>
              <p className="mt-1 whitespace-pre-wrap break-words text-[var(--gray-text)]">
                {comment.body}
              </p>
              {(isOwner || comment.username === username) && (
                <button
                  type="button"
                  onClick={() => handleDelete(comment.id)}
                  aria-label={`Delete comment by ${comment.username ?? "a deleted user"}`}
                  className="text-xs font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canComment && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-label="Add a comment"
            placeholder="Add a comment"
            rows={2}
            maxLength={2000}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            className="self-start rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Post
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-[var(--secondary-purple)]">
          {error}
        </p>
      )}
    </div>
  );
};
