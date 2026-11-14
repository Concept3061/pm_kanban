import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import {
  ApiError,
  createBoard,
  deleteBoard,
  getBoard,
  listBoards,
  renameBoard,
} from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listBoards: vi.fn(),
  createBoard: vi.fn(),
  renameBoard: vi.fn(),
  deleteBoard: vi.fn(),
  getBoard: vi.fn(),
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
      { id: 1, name: "Alpha" },
      { id: 2, name: "Beta" },
    ]);
    vi.mocked(getBoard).mockResolvedValue(initialData);
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
    vi.mocked(createBoard).mockResolvedValue({ id: 3, name: "Gamma" });
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
});
