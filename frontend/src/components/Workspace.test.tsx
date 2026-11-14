import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import {
  ApiError,
  createBoard,
  deleteBoard,
  getBoard,
  getOverview,
  listBoards,
  listMembers,
  getCommentCounts,
  renameBoard,
  unshareBoard,
} from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listBoards: vi.fn(),
  createBoard: vi.fn(),
  renameBoard: vi.fn(),
  deleteBoard: vi.fn(),
  unshareBoard: vi.fn(),
  listMembers: vi.fn(),
  getCommentCounts: vi.fn(),
  getBoard: vi.fn(),
  getOverview: vi.fn(),
  saveBoard: vi.fn(),
  logout: vi.fn(),
}));

const onSignedOut = vi.fn();

const boardsNav = () => screen.findByRole("navigation", { name: "Boards" });

const renderWorkspace = async () => {
  render(<Workspace username="user" onSignedOut={onSignedOut} />);
  return boardsNav();
};

describe("Workspace", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listBoards).mockResolvedValue([
      { id: 1, name: "Alpha", owner: "user", role: "owner" },
      { id: 2, name: "Beta", owner: "user", role: "owner" },
    ]);
    vi.mocked(getBoard).mockResolvedValue(initialData);
    vi.mocked(getCommentCounts).mockResolvedValue({});
    vi.mocked(listMembers).mockResolvedValue([]);
  });

  it("opens the first board and marks it active", async () => {
    const nav = await renderWorkspace();
    expect(getBoard).toHaveBeenCalledWith(1);
    expect(within(nav).getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");
    expect(within(nav).getByRole("button", { name: "Beta" })).toHaveAttribute("aria-pressed", "false");
  });

  it("loads the chosen board", async () => {
    const nav = await renderWorkspace();
    await userEvent.click(within(nav).getByRole("button", { name: "Beta" }));
    await waitFor(() => expect(getBoard).toHaveBeenLastCalledWith(2));
    expect(within(await boardsNav()).getByRole("button", { name: "Beta" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("creates a board and switches to it", async () => {
    vi.mocked(createBoard).mockResolvedValue({ id: 3, name: "Gamma", owner: "user", role: "owner" });
    const nav = await renderWorkspace();
    await userEvent.click(within(nav).getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "  Gamma {Enter}");
    expect(createBoard).toHaveBeenCalledWith("Gamma");
    await waitFor(() => expect(getBoard).toHaveBeenLastCalledWith(3));
    expect(within(await boardsNav()).getByRole("button", { name: "Gamma" })).toBeInTheDocument();
  });

  it("ignores a blank board name", async () => {
    const nav = await renderWorkspace();
    await userEvent.click(within(nav).getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "   {Enter}");
    expect(createBoard).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Board name")).not.toBeInTheDocument();
  });

  it("renames the active board", async () => {
    vi.mocked(renameBoard).mockResolvedValue({ id: 1, name: "Omega" });
    const nav = await renderWorkspace();
    await userEvent.click(within(nav).getByRole("button", { name: "Rename board" }));
    const input = screen.getByLabelText("Board name");
    expect(input).toHaveValue("Alpha");
    await userEvent.clear(input);
    await userEvent.type(input, "Omega{Enter}");
    expect(renameBoard).toHaveBeenCalledWith(1, "Omega");
    expect(await screen.findByRole("button", { name: "Omega" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument();
  });

  it("cancelling leaves the boards alone", async () => {
    const nav = await renderWorkspace();
    await userEvent.click(within(nav).getByRole("button", { name: "New board" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(createBoard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "New board" })).toBeInTheDocument();
  });

  it("deletes the active board after confirming", async () => {
    vi.mocked(deleteBoard).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const nav = await renderWorkspace();
    await userEvent.click(within(nav).getByRole("button", { name: "Delete board" }));
    expect(deleteBoard).toHaveBeenCalledWith(1);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Beta" })).toHaveAttribute("aria-pressed", "true");
    // With one board left, it cannot be deleted.
    expect(screen.queryByRole("button", { name: "Delete board" })).not.toBeInTheDocument();
  });

  it("keeps the board when deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const nav = await renderWorkspace();
    await userEvent.click(within(nav).getByRole("button", { name: "Delete board" }));
    expect(deleteBoard).not.toHaveBeenCalled();
  });

  it("shows an error when creating fails", async () => {
    vi.mocked(createBoard).mockRejectedValue(new ApiError(500, "failed"));
    const nav = await renderWorkspace();
    await userEvent.click(within(nav).getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "Gamma{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not create/i);
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("signs out when the session has ended", async () => {
    vi.mocked(listBoards).mockRejectedValue(new ApiError(401, "failed"));
    render(<Workspace username="user" onSignedOut={onSignedOut} />);
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
  });

  it("shows an error when boards cannot load", async () => {
    vi.mocked(listBoards).mockRejectedValue(new ApiError(500, "failed"));
    render(<Workspace username="user" onSignedOut={onSignedOut} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load your boards/i);
  });

  describe("with shared boards", () => {
    beforeEach(() => {
      vi.mocked(listBoards).mockResolvedValue([
        { id: 1, name: "Mine", owner: "user", role: "owner" },
        { id: 2, name: "Theirs", owner: "pat", role: "editor" },
        { id: 3, name: "Watching", owner: "sam", role: "viewer" },
      ]);
    });

    it("labels shared boards with their owner", async () => {
      const nav = await renderWorkspace();
      expect(within(nav).getByRole("button", { name: "Mine" })).toBeInTheDocument();
      expect(within(nav).getByRole("button", { name: "Theirs (pat)" })).toBeInTheDocument();
      expect(within(nav).getByRole("button", { name: "Watching (sam)" })).toBeInTheDocument();
    });

    it("offers owners sharing and rename, but not delete of their only board", async () => {
      const nav = await renderWorkspace();
      expect(within(nav).getByRole("button", { name: "Rename board" })).toBeInTheDocument();
      expect(within(nav).queryByRole("button", { name: "Delete board" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    });

    it("lets an editor edit but not manage the board", async () => {
      const nav = await renderWorkspace();
      await userEvent.click(within(nav).getByRole("button", { name: "Theirs (pat)" }));
      await waitFor(() => expect(getBoard).toHaveBeenLastCalledWith(2));
      const updated = await boardsNav();
      expect(within(updated).queryByRole("button", { name: "Rename board" })).not.toBeInTheDocument();
      expect(within(updated).queryByRole("button", { name: "Delete board" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Leave board" })).toBeInTheDocument();
      expect(await screen.findByRole("button", { name: "AI Assistant" })).toBeInTheDocument();
      expect(screen.queryByText("View only")).not.toBeInTheDocument();
    });

    it("makes a viewer's board read-only", async () => {
      const nav = await renderWorkspace();
      await userEvent.click(within(nav).getByRole("button", { name: "Watching (sam)" }));
      expect(await screen.findByText("View only")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "AI Assistant" })).not.toBeInTheDocument();
    });

    it("leaves a shared board and returns to the first board", async () => {
      vi.mocked(unshareBoard).mockResolvedValue(undefined);
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const nav = await renderWorkspace();
      await userEvent.click(within(nav).getByRole("button", { name: "Theirs (pat)" }));
      await userEvent.click(await screen.findByRole("button", { name: "Leave board" }));
      expect(unshareBoard).toHaveBeenCalledWith(2, "user");
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Theirs (pat)" })).not.toBeInTheDocument()
      );
      expect(screen.getByRole("button", { name: "Mine" })).toHaveAttribute("aria-pressed", "true");
    });

    it("allows deleting an owned board once there are two", async () => {
      vi.mocked(listBoards).mockResolvedValue([
        { id: 1, name: "Mine", owner: "user", role: "owner" },
        { id: 2, name: "Also mine", owner: "user", role: "owner" },
        { id: 3, name: "Theirs", owner: "pat", role: "editor" },
      ]);
      const nav = await renderWorkspace();
      expect(within(nav).getByRole("button", { name: "Delete board" })).toBeInTheDocument();
    });
  });

  it("opens the overview and returns to the board that was open", async () => {
    vi.mocked(getOverview).mockResolvedValue({
      totals: { boards: 2, cards: 0, overdue: 0, highPriority: 0 },
      boards: [
        { id: 1, name: "Alpha", owner: "user", role: "owner", cards: 0, overdue: 0, highPriority: 0, columns: [] },
        { id: 2, name: "Beta", owner: "user", role: "owner", cards: 0, overdue: 0, highPriority: 0, columns: [] },
      ],
    });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Boards" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back to boards" }));
    expect(within(await boardsNav()).getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens a board chosen in the overview", async () => {
    vi.mocked(getOverview).mockResolvedValue({
      totals: { boards: 2, cards: 0, overdue: 0, highPriority: 0 },
      boards: [
        { id: 1, name: "Alpha", owner: "user", role: "owner", cards: 0, overdue: 0, highPriority: 0, columns: [] },
        { id: 2, name: "Beta", owner: "user", role: "owner", cards: 0, overdue: 0, highPriority: 0, columns: [] },
      ],
    });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Overview" }));
    await userEvent.click(await screen.findByRole("button", { name: "Open Beta" }));
    expect(within(await boardsNav()).getByRole("button", { name: "Beta" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(getBoard).toHaveBeenLastCalledWith(2));
  });
});
