import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Overview } from "@/components/Overview";
import { ApiError, getOverview, type OverviewData } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getOverview: vi.fn(),
}));

const data: OverviewData = {
  totals: { boards: 2, cards: 5, overdue: 1, highPriority: 2 },
  boards: [
    {
      id: 1,
      name: "Alpha",
      owner: "user",
      role: "owner",
      cards: 4,
      overdue: 1,
      highPriority: 2,
      columns: [
        { title: "To Do", count: 3 },
        { title: "Done", count: 1 },
      ],
    },
    {
      id: 2,
      name: "Beta",
      owner: "pat",
      role: "viewer",
      cards: 0,
      overdue: 0,
      highPriority: 0,
      columns: [{ title: "To Do", count: 0 }],
    },
  ],
};

const onOpenBoard = vi.fn();
const onClose = vi.fn();
const onSignedOut = vi.fn();

const renderOverview = () =>
  render(<Overview onOpenBoard={onOpenBoard} onClose={onClose} onSignedOut={onSignedOut} />);

describe("Overview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getOverview).mockResolvedValue(data);
  });

  it("shows the totals", async () => {
    renderOverview();
    await screen.findByRole("heading", { name: "Alpha" });
    for (const [label, value] of [
      ["Boards", "2"],
      ["Cards", "5"],
      ["Overdue", "1"],
      ["High priority", "2"],
    ]) {
      expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value);
    }
  });

  it("summarises each board and its columns", async () => {
    renderOverview();
    const boards = await screen.findByRole("list", { name: "Boards" });
    expect(within(boards).getByText("4 cards, 1 overdue, 2 high priority")).toBeInTheDocument();
    expect(within(boards).getByText("Owned by you")).toBeInTheDocument();
    expect(within(boards).getByText("viewer - pat")).toBeInTheDocument();
    const columns = within(boards).getByRole("list", { name: "Alpha columns" });
    const rows = within(columns).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("To Do3");
    expect(rows[1]).toHaveTextContent("Done1");
  });

  it("opens a board", async () => {
    renderOverview();
    await userEvent.click(await screen.findByRole("button", { name: "Open Beta" }));
    expect(onOpenBoard).toHaveBeenCalledWith(2);
  });

  it("goes back to the boards", async () => {
    renderOverview();
    await userEvent.click(screen.getByRole("button", { name: "Back to boards" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error when loading fails", async () => {
    vi.mocked(getOverview).mockRejectedValue(new ApiError(500, "failed"));
    renderOverview();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the overview/i);
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("signs out when the session has ended", async () => {
    vi.mocked(getOverview).mockRejectedValue(new ApiError(401, "failed"));
    renderOverview();
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
  });
});
