import type { BoardData } from "@/lib/kanban";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  reply: string;
  board: BoardData | null;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const isUnauthorized = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

const request = async <T>(
  path: string,
  method: string = "GET",
  body?: unknown
): Promise<T> => {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(response.status, `${method} ${path} failed`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
};

export const getMe = () => request<{ username: string }>("/api/auth/me");

export const login = (username: string, password: string) =>
  request<{ username: string }>("/api/auth/login", "POST", {
    username,
    password,
  });

export const logout = () => request<void>("/api/auth/logout", "POST");

export const register = (username: string, password: string) =>
  request<{ username: string }>("/api/auth/register", "POST", {
    username,
    password,
  });

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>("/api/auth/password", "POST", {
    current_password: currentPassword,
    new_password: newPassword,
  });

export const deleteAccount = (password: string) =>
  request<void>("/api/auth/me", "DELETE", { password });

export type Role = "owner" | "editor" | "viewer";

// The roles a board can be shared with.
export type ShareRole = Exclude<Role, "owner">;

export type BoardSummary = {
  id: number;
  name: string;
  owner: string;
  role: Role;
};

export type Member = { username: string; role: Role };

export const listBoards = () => request<BoardSummary[]>("/api/boards");

export const createBoard = (name: string) =>
  request<BoardSummary>("/api/boards", "POST", { name });

export const renameBoard = (id: number, name: string) =>
  request<{ id: number; name: string }>(`/api/boards/${id}`, "PATCH", { name });

export const deleteBoard = (id: number) =>
  request<void>(`/api/boards/${id}`, "DELETE");

export const getBoard = (id: number) =>
  request<BoardData>(`/api/boards/${id}`);

export const saveBoard = (id: number, board: BoardData) =>
  request<BoardData>(`/api/boards/${id}`, "PUT", board);

export const sendChat = (
  id: number,
  message: string,
  history: ChatMessage[]
) =>
  request<ChatResponse>(`/api/boards/${id}/chat`, "POST", { message, history });

export const listMembers = (boardId: number) =>
  request<Member[]>(`/api/boards/${boardId}/members`);

export const shareBoard = (
  boardId: number,
  username: string,
  role: ShareRole
) =>
  request<Member>(
    `/api/boards/${boardId}/members/${encodeURIComponent(username)}`,
    "PUT",
    { role }
  );

export const unshareBoard = (boardId: number, username: string) =>
  request<void>(
    `/api/boards/${boardId}/members/${encodeURIComponent(username)}`,
    "DELETE"
  );

export type ActivityEntry = {
  // null when the user has since deleted their account.
  username: string | null;
  viaAi: boolean;
  message: string;
  createdAt: string;
};

export const listActivity = (boardId: number) =>
  request<ActivityEntry[]>(`/api/boards/${boardId}/activity`);

export type OverviewData = {
  totals: { boards: number; cards: number; overdue: number; highPriority: number };
  boards: (BoardSummary & {
    cards: number;
    overdue: number;
    highPriority: number;
    columns: { title: string; count: number }[];
  })[];
};

export const getOverview = () => request<OverviewData>("/api/overview");

export type Comment = {
  id: number;
  // null when the author has since deleted their account.
  username: string | null;
  body: string;
  createdAt: string;
};

export const getCommentCounts = (boardId: number) =>
  request<Record<string, number>>(`/api/boards/${boardId}/comment-counts`);

export const listComments = (boardId: number, cardId: string) =>
  request<Comment[]>(
    `/api/boards/${boardId}/cards/${encodeURIComponent(cardId)}/comments`
  );

export const addComment = (boardId: number, cardId: string, body: string) =>
  request<Comment>(
    `/api/boards/${boardId}/cards/${encodeURIComponent(cardId)}/comments`,
    "POST",
    { body }
  );

export const deleteComment = (boardId: number, commentId: number) =>
  request<void>(`/api/boards/${boardId}/comments/${commentId}`, "DELETE");
