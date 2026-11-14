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

export type BoardSummary = { id: number; name: string };

export const listBoards = () => request<BoardSummary[]>("/api/boards");

export const createBoard = (name: string) =>
  request<BoardSummary>("/api/boards", "POST", { name });

export const renameBoard = (id: number, name: string) =>
  request<BoardSummary>(`/api/boards/${id}`, "PATCH", { name });

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
