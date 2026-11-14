"use client";

import { useCallback, useEffect, useState } from "react";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  ApiError,
  createBoard,
  deleteBoard,
  listBoards,
  renameBoard,
  type BoardSummary,
} from "@/lib/api";

type WorkspaceProps = {
  username: string;
  onSignedOut: () => void;
};

export const Workspace = ({ username, onSignedOut }: WorkspaceProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFailure = useCallback(
    (err: unknown, message: string) => {
      if (err instanceof ApiError && err.status === 401) {
        onSignedOut();
      } else {
        setError(message);
      }
    },
    [onSignedOut]
  );

  useEffect(() => {
    listBoards()
      .then((list) => {
        setBoards(list);
        setActiveId(list[0].id);
      })
      .catch((err) => handleFailure(err, "Could not load your boards. Please reload the page."));
  }, [handleFailure]);

  if (!boards || activeId === null) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p
          role={error ? "alert" : "status"}
          className="text-sm font-semibold text-[var(--gray-text)]"
        >
          {error ?? "Loading your boards..."}
        </p>
      </main>
    );
  }

  const handleCreate = async (name: string) => {
    try {
      const board = await createBoard(name);
      setBoards([...boards, board]);
      setActiveId(board.id);
      setError(null);
    } catch (err) {
      handleFailure(err, "Could not create the board.");
    }
  };

  const handleRename = async (id: number, name: string) => {
    try {
      const board = await renameBoard(id, name);
      setBoards(boards.map((item) => (item.id === id ? board : item)));
      setError(null);
    } catch (err) {
      handleFailure(err, "Could not rename the board.");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteBoard(id);
      const remaining = boards.filter((item) => item.id !== id);
      setBoards(remaining);
      setActiveId(remaining[0].id);
      setError(null);
    } catch (err) {
      handleFailure(err, "Could not delete the board.");
    }
  };

  return (
    <>
      <KanbanBoard
        key={activeId}
        boardId={activeId}
        username={username}
        onSignedOut={onSignedOut}
        switcher={
          <>
            <BoardSwitcher
              boards={boards}
              activeId={activeId}
              onSelect={setActiveId}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={handleDelete}
            />
            {error && (
              <p role="alert" className="text-sm font-medium text-[var(--secondary-purple)]">
                {error}
              </p>
            )}
          </>
        }
      />
    </>
  );
};
