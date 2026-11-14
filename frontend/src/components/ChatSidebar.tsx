import { useEffect, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import type { ChatMessage } from "@/lib/api";

type ChatSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string, history: ChatMessage[]) => Promise<string>;
};

export const ChatSidebar = ({ isOpen, onClose, onSend }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const send = async () => {
    const message = draft.trim();
    if (!message || isSending) {
      return;
    }
    const history = messages;
    setMessages([...history, { role: "user", content: message }]);
    setDraft("");
    setError(null);
    setIsSending(true);
    try {
      const reply = await onSend(message, history);
      setMessages([
        ...history,
        { role: "user", content: message },
        { role: "assistant", content: reply },
      ]);
    } catch {
      // Put the message back so it can be retried.
      setMessages(history);
      setDraft(message);
      setError("The assistant could not respond. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send();
  };

  return (
    <aside
      aria-label="AI assistant"
      className={clsx(
        "fixed inset-y-0 right-0 z-20 w-full flex-col border-l border-[var(--stroke)] bg-white shadow-[var(--shadow)] sm:w-[400px]",
        isOpen ? "flex" : "hidden"
      )}
    >
      <header className="border-b-2 border-[var(--accent-yellow)] bg-[var(--navy-dark)] px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">
              AI Assistant
            </h2>
            <p className="mt-1 text-xs text-white/70">
              Ask about your board or have it make changes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/30 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </header>

      <div
        ref={logRef}
        role="log"
        aria-label="Conversation"
        className="flex flex-1 flex-col gap-3 overflow-y-auto bg-[var(--surface)] px-5 py-5"
      >
        {messages.length === 0 && !isSending && (
          <p className="m-auto max-w-[260px] text-center text-sm leading-6 text-[var(--gray-text)]">
            Try &ldquo;Add a card for the launch plan to Backlog&rdquo; or
            &ldquo;Move everything in Review to Done&rdquo;.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            data-testid={`chat-${message.role}`}
            className={clsx(
              "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6",
              message.role === "user"
                ? "self-end rounded-br-md bg-[var(--primary-blue)] text-white"
                : "self-start rounded-bl-md border border-[var(--stroke)] bg-white text-[var(--navy-dark)]"
            )}
          >
            {message.content}
          </div>
        ))}
        {isSending && (
          <div
            aria-label="Assistant is thinking"
            role="status"
            className="flex gap-1.5 self-start rounded-2xl rounded-bl-md border border-[var(--stroke)] bg-white px-4 py-4"
          >
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                style={{ animationDelay: `${delay}ms` }}
                className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent-yellow)]"
              />
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[var(--stroke)] bg-white p-4">
        {error && (
          <p role="alert" className="mb-3 text-sm font-medium text-[var(--secondary-purple)]">
            {error}
          </p>
        )}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Message the assistant"
          aria-label="Message the assistant"
          rows={3}
          className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={isSending || !draft.trim()}
          className="mt-2 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
};
