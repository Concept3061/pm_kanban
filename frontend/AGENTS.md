# Frontend

Next.js 16 / React 19 client-rendered app, styled with Tailwind v4, with drag and drop from `@dnd-kit`. It is built as a static export (`output: "export"`) and served by the FastAPI backend. `@/` aliases `src/`.

## Code

- `src/app/` - root layout, global CSS variables (project colors) and the single page
- `src/lib/kanban.ts` - board types (`BoardData` = ordered `columns` holding `cardIds`, plus a `cards` record keyed by id), the `initialData` seed used by tests, the pure `moveCard` logic and `createId`
- `src/lib/api.ts` - typed client for the backend API; throws `ApiError` on failure
- `src/components/AuthGate.tsx` - checks the session, then shows `LoginForm` or `KanbanBoard`
- `src/components/KanbanBoard.tsx` - owns board state and `DndContext`, loads from the API and saves each change in order
- `src/components/KanbanColumn.tsx`, `KanbanCard.tsx`, `KanbanCardPreview.tsx`, `NewCardForm.tsx` - board UI; cards edit in place
- `src/components/ChatSidebar.tsx` - AI chat; history lives in this component only

## Development

`npm run dev` serves on port 3000 and proxies `/api` to the backend on `http://127.0.0.1:8000`, so start the container first.

## Tests

- `npm run test:unit` - vitest with jsdom, `src/**/*.test.ts(x)`; the API client is mocked
- `npm run test:e2e` - Playwright, `tests/*.spec.ts`; starts the container as Compose project `pm-e2e` on port 8001 with its own data volume, and removes it afterwards
