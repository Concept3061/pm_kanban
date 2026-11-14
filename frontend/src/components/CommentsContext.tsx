import { createContext } from "react";

export type CommentsContextValue = {
  boardId: number;
  username: string;
  canComment: boolean;
  isOwner: boolean;
  // Comments per card, for cards that have any.
  counts: Record<string, number>;
  onCountChange: (cardId: string, count: number) => void;
};

export const CommentsContext = createContext<CommentsContextValue>({
  boardId: 0,
  username: "",
  canComment: false,
  isOwner: false,
  counts: {},
  onCountChange: () => {},
});
