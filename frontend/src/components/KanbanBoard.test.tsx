import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  ApiError,
  addComment,
  deleteComment,
  getBoard,
  getCommentCounts,
  listComments,
  listMembers,
  logout,
  saveBoard,
  sendChat,
} from "@/lib/api";
import { initialData, type BoardData } from "@/lib/kanban";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getBoard: vi.fn(),
  listMembers: vi.fn(),
  getCommentCounts: vi.fn(),
  listComments: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
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
    vi.mocked(getCommentCounts).mockResolvedValue({});
    vi.mocked(listComments).mockResolvedValue([]);
    vi.mocked(listMembers).mockResolvedValue([
      { username: "user", role: "owner" },
      { username: "pat", role: "editor" },
    ]);
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
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "high");
    await userEvent.type(screen.getByLabelText("Due date"), "2999-12-31");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Edited title")).toBeInTheDocument();
    expect(screen.getByText("Edited details")).toBeInTheDocument();
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
    expect(lastSaved().cards["card-1"]).toEqual({
      id: "card-1",
      title: "Edited title",
      details: "Edited details",
      priority: "high",
      dueDate: "2999-12-31",
      assignee: "",
    });
    expect(screen.getByTestId("priority-card-1")).toHaveTextContent("high");
    expect(screen.getByTestId("due-card-1")).toHaveTextContent("Due 2999-12-31");
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

  it("adds a column and saves it", async () => {
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
    const saved = lastSaved();
    expect(saved.columns).toHaveLength(6);
    expect(saved.columns[5]).toMatchObject({ title: "New column", cardIds: [] });
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(6);
  });

  it("deletes an empty column without asking", async () => {
    const confirm = vi.spyOn(window, "confirm");
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete column New column" })
    );
    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(2));
    expect(lastSaved().columns).toHaveLength(5);
  });

  it("deletes a column and its cards after confirming", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderBoard();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete column Backlog" })
    );
    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
    const saved = lastSaved();
    expect(saved.columns.map((column) => column.id)).not.toContain("col-backlog");
    expect(Object.keys(saved.cards)).not.toContain("card-1");
    expect(Object.keys(saved.cards)).not.toContain("card-2");
    expect(Object.keys(saved.cards)).toContain("card-3");
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("keeps a column with cards when deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderBoard();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete column Backlog" })
    );
    expect(saveBoard).not.toHaveBeenCalled();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("does not offer to delete the last column", async () => {
    vi.mocked(getBoard).mockResolvedValue({
      columns: [{ id: "only", title: "Only", cardIds: [] }],
      cards: {},
    });
    await renderBoard();
    expect(screen.queryByRole("button", { name: /delete column/i })).not.toBeInTheDocument();
  });

  it("adds a card with a priority and due date", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: "Add a card" }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "Urgent");
    await userEvent.selectOptions(within(column).getByLabelText("Priority"), "medium");
    await userEvent.type(within(column).getByLabelText("Due date"), "2999-01-02");
    await userEvent.click(within(column).getByRole("button", { name: "Add card" }));

    await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
    const added = Object.values(lastSaved().cards).find((card) => card.title === "Urgent");
    expect(added).toMatchObject({ priority: "medium", dueDate: "2999-01-02" });
  });

  it("shows nothing extra for cards without a priority or due date", async () => {
    await renderBoard();
    expect(screen.queryByTestId("priority-card-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("due-card-1")).not.toBeInTheDocument();
  });

  it("marks a past due date as overdue", async () => {
    vi.mocked(getBoard).mockResolvedValue({
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": { ...initialData.cards["card-1"], priority: "low", dueDate: "2000-01-01" },
      },
    });
    await renderBoard();
    expect(screen.getByTestId("due-card-1")).toHaveTextContent("Overdue: 2000-01-01");
    expect(screen.getByTestId("priority-card-1")).toHaveTextContent("low");
  });

  describe("when read-only", () => {
    const renderReadOnly = async () => {
      render(<KanbanBoard boardId={1} readOnly username="user" onSignedOut={onSignedOut} />);
      await screen.findByRole("heading", { name: "Kanban Studio" });
    };

    it("shows the board without any way to change it", async () => {
      await renderReadOnly();
      expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
      expect(screen.getByText("View only")).toBeInTheDocument();
      for (const name of [/add a card/i, /add column/i, /^edit /i, /^delete /i, /ai assistant/i]) {
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      }
      expect(screen.queryByLabelText("Message the assistant")).not.toBeInTheDocument();
      expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveAttribute("readonly");
    });

    it("does not save when a column title is typed into", async () => {
      await renderReadOnly();
      const input = within(getFirstColumn()).getByLabelText("Column title");
      await userEvent.type(input, "x{Enter}");
      await userEvent.tab();
      expect(saveBoard).not.toHaveBeenCalled();
    });
  });

  describe("filtering", () => {
    const visibleTitles = () =>
      screen.getAllByTestId(/^card-/).map((card) => within(card).getByRole("heading").textContent);

    it("searches titles and details", async () => {
      await renderBoard();
      await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
      expect(visibleTitles()).toEqual(["Align roadmap themes"]);
      await userEvent.clear(screen.getByLabelText("Search cards"));
      await userEvent.type(screen.getByLabelText("Search cards"), "hover");
      expect(visibleTitles()).toEqual(["QA micro-interactions"]);
    });

    it("shows how many cards match in each column", async () => {
      await renderBoard();
      await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
      expect(within(getFirstColumn()).getByText(/1 of 2\s+cards/)).toBeInTheDocument();
      expect(screen.getAllByText("No matching cards")).toHaveLength(4);
      expect(screen.queryByText("Drop a card here")).not.toBeInTheDocument();
    });

    it("filters by priority and overdue, and clears", async () => {
      vi.mocked(getBoard).mockResolvedValue({
        ...initialData,
        cards: {
          ...initialData.cards,
          "card-1": { ...initialData.cards["card-1"], priority: "high", dueDate: "2000-01-01" },
          "card-2": { ...initialData.cards["card-2"], priority: "high", dueDate: "2999-01-01" },
        },
      });
      await renderBoard();
      await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");
      expect(visibleTitles()).toEqual(["Align roadmap themes", "Gather customer signals"]);
      await userEvent.click(screen.getByLabelText("Overdue only"));
      expect(visibleTitles()).toEqual(["Align roadmap themes"]);
      await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(visibleTitles()).toHaveLength(8);
      expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    });

    it("does not change or save the board", async () => {
      await renderBoard();
      await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
      expect(saveBoard).not.toHaveBeenCalled();
    });

    it("saves every card when a card is added while filtered", async () => {
      await renderBoard();
      await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
      const column = getFirstColumn();
      await userEvent.click(within(column).getByRole("button", { name: "Add a card" }));
      await userEvent.type(within(column).getByPlaceholderText(/card title/i), "Extra");
      await userEvent.click(within(column).getByRole("button", { name: "Add card" }));
      await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
      expect(Object.keys(lastSaved().cards)).toHaveLength(9);
    });
  });

  describe("assignees", () => {
    it("offers the board's members and saves the choice", async () => {
      await renderBoard();
      expect(listMembers).toHaveBeenCalledWith(1);
      await userEvent.click(screen.getByRole("button", { name: "Edit Align roadmap themes" }));
      const select = screen.getByLabelText("Assignee");
      expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Unassigned",
        "user",
        "pat",
      ]);
      await userEvent.selectOptions(select, "pat");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
      expect(lastSaved().cards["card-1"].assignee).toBe("pat");
      expect(screen.getByTestId("assignee-card-1")).toHaveTextContent("@pat");
    });

    it("assigns a new card", async () => {
      await renderBoard();
      const column = getFirstColumn();
      await userEvent.click(within(column).getByRole("button", { name: "Add a card" }));
      await userEvent.type(within(column).getByPlaceholderText(/card title/i), "Mine");
      await userEvent.selectOptions(within(column).getByLabelText("Assignee"), "user");
      await userEvent.click(within(column).getByRole("button", { name: "Add card" }));
      await waitFor(() => expect(saveBoard).toHaveBeenCalledTimes(1));
      const added = Object.values(lastSaved().cards).find((card) => card.title === "Mine");
      expect(added?.assignee).toBe("user");
    });

    it("shows nothing for unassigned cards", async () => {
      await renderBoard();
      expect(screen.queryByTestId("assignee-card-1")).not.toBeInTheDocument();
    });

    it("filters to cards assigned to the signed-in user", async () => {
      vi.mocked(getBoard).mockResolvedValue({
        ...initialData,
        cards: {
          ...initialData.cards,
          "card-3": { ...initialData.cards["card-3"], assignee: "user" },
          "card-4": { ...initialData.cards["card-4"], assignee: "pat" },
        },
      });
      await renderBoard();
      await userEvent.click(screen.getByLabelText("Assigned to me"));
      const titles = screen.getAllByTestId(/^card-/).map((c) => within(c).getByRole("heading").textContent);
      expect(titles).toEqual(["Prototype analytics view"]);
      await userEvent.click(screen.getByLabelText("Assigned to me"));
      expect(screen.getAllByTestId(/^card-/)).toHaveLength(8);
    });

    it("still works when the members cannot be loaded", async () => {
      vi.mocked(listMembers).mockRejectedValue(new ApiError(500, "failed"));
      await renderBoard();
      await userEvent.click(screen.getByRole("button", { name: "Edit Align roadmap themes" }));
      expect(within(screen.getByLabelText("Assignee")).getAllByRole("option")).toHaveLength(1);
    });
  });

  describe("comments", () => {
    const comment = (id: number, username: string | null, body: string) => ({
      id,
      username,
      body,
      createdAt: "2030-01-02T03:04:05+00:00",
    });

    const openComments = async (title = "Align roadmap themes") => {
      await userEvent.click(
        screen.getByRole("button", { name: new RegExp(`^Comments \\(\\d+\\) on ${title}$`) })
      );
    };

    it("shows how many comments each card has", async () => {
      vi.mocked(getCommentCounts).mockResolvedValue({ "card-1": 3 });
      await renderBoard();
      expect(
        await screen.findByRole("button", { name: "Comments (3) on Align roadmap themes" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Comments (0) on Gather customer signals" })
      ).toBeInTheDocument();
    });

    it("loads a card's comments only when opened", async () => {
      vi.mocked(listComments).mockResolvedValue([comment(1, "pat", "Nice work")]);
      await renderBoard();
      expect(listComments).not.toHaveBeenCalled();
      await openComments();
      expect(await screen.findByText("Nice work")).toBeInTheDocument();
      expect(listComments).toHaveBeenCalledWith(1, "card-1");
    });

    it("posts a comment and updates the count", async () => {
      vi.mocked(addComment).mockResolvedValue(comment(5, "user", "Done it"));
      await renderBoard();
      await openComments();
      await userEvent.type(await screen.findByLabelText("Add a comment"), "  Done it ");
      await userEvent.click(screen.getByRole("button", { name: "Post" }));
      expect(addComment).toHaveBeenCalledWith(1, "card-1", "Done it");
      expect(await screen.findByText("Done it")).toBeInTheDocument();
      expect(screen.getByLabelText("Add a comment")).toHaveValue("");
      expect(
        screen.getByRole("button", { name: "Comments (1) on Align roadmap themes" })
      ).toBeInTheDocument();
      // Posting does not touch the saved board.
      expect(saveBoard).not.toHaveBeenCalled();
    });

    it("does not post a blank comment", async () => {
      await renderBoard();
      await openComments();
      await userEvent.type(await screen.findByLabelText("Add a comment"), "   ");
      await userEvent.click(screen.getByRole("button", { name: "Post" }));
      expect(addComment).not.toHaveBeenCalled();
    });

    it("keeps the text and shows an error when posting fails", async () => {
      vi.mocked(addComment).mockRejectedValue(new ApiError(500, "failed"));
      await renderBoard();
      await openComments();
      await userEvent.type(await screen.findByLabelText("Add a comment"), "Hello");
      await userEvent.click(screen.getByRole("button", { name: "Post" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/could not post/i);
      expect(screen.getByLabelText("Add a comment")).toHaveValue("Hello");
    });

    it("lets authors delete their own comments but not other people's", async () => {
      vi.mocked(getCommentCounts).mockResolvedValue({ "card-1": 2 });
      vi.mocked(listComments).mockResolvedValue([
        comment(1, "pat", "Pat's"),
        comment(2, "user", "Mine"),
      ]);
      vi.mocked(deleteComment).mockResolvedValue(undefined);
      await renderBoard();
      await openComments();
      await screen.findByText("Mine");
      expect(screen.queryByRole("button", { name: "Delete comment by pat" })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Delete comment by user" }));
      expect(deleteComment).toHaveBeenCalledWith(1, 2);
      await waitFor(() => expect(screen.queryByText("Mine")).not.toBeInTheDocument());
      expect(
        screen.getByRole("button", { name: "Comments (1) on Align roadmap themes" })
      ).toBeInTheDocument();
    });

    it("lets the board owner delete anyone's comment", async () => {
      vi.mocked(listComments).mockResolvedValue([comment(1, "pat", "Pat's")]);
      render(<KanbanBoard boardId={1} isOwner username="user" onSignedOut={onSignedOut} />);
      await screen.findByRole("heading", { name: "Kanban Studio" });
      await openComments();
      expect(await screen.findByRole("button", { name: "Delete comment by pat" })).toBeInTheDocument();
    });

    it("names comments from deleted users", async () => {
      vi.mocked(listComments).mockResolvedValue([comment(1, null, "Bye")]);
      await renderBoard();
      await openComments();
      expect(await screen.findByText("A deleted user")).toBeInTheDocument();
    });

    it("shows an error when comments cannot load", async () => {
      vi.mocked(listComments).mockRejectedValue(new ApiError(500, "failed"));
      await renderBoard();
      await openComments();
      expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the comments/i);
    });

    it("lets viewers read comments but not write them", async () => {
      vi.mocked(listComments).mockResolvedValue([comment(1, "pat", "Readable")]);
      render(<KanbanBoard boardId={1} readOnly username="user" onSignedOut={onSignedOut} />);
      await screen.findByRole("heading", { name: "Kanban Studio" });
      await openComments();
      expect(await screen.findByText("Readable")).toBeInTheDocument();
      expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
    });

    it("still shows the board when the counts cannot load", async () => {
      vi.mocked(getCommentCounts).mockRejectedValue(new ApiError(500, "failed"));
      await renderBoard();
      expect(
        screen.getByRole("button", { name: "Comments (0) on Align roadmap themes" })
      ).toBeInTheDocument();
    });
  });
});
