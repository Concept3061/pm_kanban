import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ApiError, getBoard, logout, saveBoard, sendChat } from "@/lib/api";
import { initialData, type BoardData } from "@/lib/kanban";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getBoard: vi.fn(),
  saveBoard: vi.fn(),
  logout: vi.fn(),
  sendChat: vi.fn(),
}));

const onSignedOut = vi.fn();

const renderBoard = async () => {
  render(<KanbanBoard boardId={1} username="user" onSignedOut={onSignedOut} />);
  await screen.findByRole("heading", { name: "Kanban Studio" });
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

const lastSaved = () => vi.mocked(saveBoard).mock.lastCall?.[1] as BoardData;

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getBoard).mockResolvedValue(initialData);
    vi.mocked(saveBoard).mockImplementation(async (_id, board) => board);
    vi.mocked(logout).mockResolvedValue(undefined);
  });

  it("renders the board from the API", async () => {
    await renderBoard();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(saveBoard).not.toHaveBeenCalled();
  });

  it("shows an error when the board cannot load", async () => {
    vi.mocked(getBoard).mockRejectedValue(new ApiError(500, "failed"));
    render(<KanbanBoard boardId={1} username="user" onSignedOut={onSignedOut} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("signs out when loading is unauthorized", async () => {
    vi.mocked(getBoard).mockRejectedValue(new ApiError(401, "failed"));
    render(<KanbanBoard boardId={1} username="user" onSignedOut={onSignedOut} />);
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
  });

  it("saves a renamed column on blur, once", async () => {
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(saveBoard).not.toHaveBeenCalled();
    await userEvent.tab();
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
    expect(lastSaved().columns[0].title).toBe("New Name");
    expect(
      within(getFirstColumn()).getByLabelText("Column title")
    ).toHaveValue("New Name");
  });

  it("saves a renamed column on enter", async () => {
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Entered{Enter}");
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
    expect(lastSaved().columns[0].title).toBe("Entered");
  });

  it("restores the title when a rename is blank", async () => {
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.tab();
    expect(input).toHaveValue("Backlog");
    expect(saveBoard).not.toHaveBeenCalled();
  });

  it("adds and removes a card, saving each change", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "New card"
    );
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
    expect(Object.values(lastSaved().cards).map((card) => card.title)).toContain(
      "New card"
    );

    await userEvent.click(
      within(column).getByRole("button", { name: /delete new card/i })
    );
    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(2));
    expect(Object.values(lastSaved().cards).map((card) => card.title)).not.toContain(
      "New card"
    );
  });

  it("edits a card and saves it", async () => {
    await renderBoard();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit Align roadmap themes" })
    );
    const title = screen.getByLabelText("Edit title");
    await userEvent.clear(title);
    await userEvent.type(title, "Edited title");
    const details = screen.getByLabelText("Edit details");
    await userEvent.clear(details);
    await userEvent.type(details, "Edited details");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Edited title")).toBeInTheDocument();
    expect(screen.getByText("Edited details")).toBeInTheDocument();
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
    expect(lastSaved().cards["card-1"]).toEqual({
      id: "card-1",
      title: "Edited title",
      details: "Edited details",
    });
  });

  it("does not save when an edit is cancelled or the title is blank", async () => {
    await renderBoard();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit Align roadmap themes" })
    );
    await userEvent.type(screen.getByLabelText("Edit title"), " changed");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Edit Align roadmap themes" })
    );
    const title = screen.getByLabelText("Edit title");
    expect(title).toHaveValue("Align roadmap themes");
    await userEvent.clear(title);
    await userEvent.type(title, "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByLabelText("Edit title")).toBeInTheDocument();
    expect(saveBoard).not.toHaveBeenCalled();
  });

  it("saves changes one at a time, in order", async () => {
    const resolvers: (() => void)[] = [];
    vi.mocked(saveBoard).mockImplementation(
      (_id, board) =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(board));
        })
    );
    await renderBoard();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Align roadmap themes" })
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Gather customer signals" })
    );

    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
    resolvers[0]();
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(2));
    resolvers[1]();
    expect(Object.keys(lastSaved().cards)).not.toContain("card-1");
    expect(Object.keys(lastSaved().cards)).not.toContain("card-2");
  });

  it("shows an error when a save fails and clears it after the next save", async () => {
    vi.mocked(saveBoard).mockRejectedValueOnce(new ApiError(500, "failed"));
    await renderBoard();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Align roadmap themes" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be saved/i);

    await userEvent.click(
      screen.getByRole("button", { name: "Delete Gather customer signals" })
    );
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    );
  });

  it("signs out when a save is unauthorized", async () => {
    vi.mocked(saveBoard).mockRejectedValue(new ApiError(401, "failed"));
    await renderBoard();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Align roadmap themes" })
    );
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
  });

  it("logs out", async () => {
    await renderBoard();
    expect(screen.getByText("Signed in as user")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(logout).toHaveBeenCalled();
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
  });

  it("refreshes the board when the AI changes it, without saving again", async () => {
    const updated: BoardData = {
      ...initialData,
      columns: initialData.columns.map((column) =>
        column.id === "col-backlog" ? { ...column, cardIds: ["card-1"] } : column
      ),
      cards: Object.fromEntries(
        Object.entries(initialData.cards).filter(([id]) => id !== "card-2")
      ),
    };
    vi.mocked(sendChat).mockResolvedValue({ reply: "Removed it.", board: updated });
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "AI Assistant" }));
    await userEvent.type(
      screen.getByLabelText("Message the assistant"),
      "Remove that card{Enter}"
    );

    expect(await screen.findByText("Removed it.")).toBeInTheDocument();
    expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument();
    expect(saveBoard).not.toHaveBeenCalled();
  });

  it("keeps the board when the AI only replies", async () => {
    vi.mocked(sendChat).mockResolvedValue({ reply: "Just talking.", board: null });
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "AI Assistant" }));
    await userEvent.type(screen.getByLabelText("Message the assistant"), "Hi{Enter}");

    expect(await screen.findByText("Just talking.")).toBeInTheDocument();
    expect(screen.getByText("Gather customer signals")).toBeInTheDocument();
  });

  it("waits for pending saves before calling the AI", async () => {
    let finishSave = () => {};
    vi.mocked(saveBoard).mockImplementation(
      (_id, board) =>
        new Promise((resolve) => {
          finishSave = () => resolve(board);
        })
    );
    vi.mocked(sendChat).mockResolvedValue({ reply: "Done.", board: null });
    await renderBoard();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Align roadmap themes" })
    );
    await userEvent.click(screen.getByRole("button", { name: "AI Assistant" }));
    await userEvent.type(screen.getByLabelText("Message the assistant"), "Hi{Enter}");
    await waitFor(() => expect(saveBoard).toHaveBeenCalled());
    expect(sendChat).not.toHaveBeenCalled();

    finishSave();
    expect(await screen.findByText("Done.")).toBeInTheDocument();
    expect(sendChat).toHaveBeenCalled();
  });

  it("signs out when chat is unauthorized", async () => {
    vi.mocked(sendChat).mockRejectedValue(new ApiError(401, "failed"));
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "AI Assistant" }));
    await userEvent.type(screen.getByLabelText("Message the assistant"), "Hi{Enter}");
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
  });
});
