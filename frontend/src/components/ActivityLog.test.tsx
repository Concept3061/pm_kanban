import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityLog } from "@/components/ActivityLog";
import { listActivity } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listActivity: vi.fn(),
}));

const entry = (overrides = {}) => ({
  username: "pat",
  viaAi: false,
  message: 'edited card "Plan"',
  createdAt: "2030-01-02T03:04:05+00:00",
  ...overrides,
});

const open = async () => {
  render(<ActivityLog boardId={4} />);
  await userEvent.click(screen.getByRole("button", { name: "Activity" }));
};

describe("ActivityLog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not load until opened", () => {
    render(<ActivityLog boardId={4} />);
    expect(listActivity).not.toHaveBeenCalled();
  });

  it("lists who did what", async () => {
    vi.mocked(listActivity).mockResolvedValue([
      entry(),
      entry({ username: "user", viaAi: true, message: 'added card "New" to Backlog' }),
      entry({ username: null, message: 'deleted card "Old"' }),
    ]);
    await open();
    const list = await screen.findByRole("list", { name: "Activity" });
    expect(listActivity).toHaveBeenCalledWith(4);
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('pat edited card "Plan"');
    expect(items[1]).toHaveTextContent('user (via AI) added card "New" to Backlog');
    expect(items[2]).toHaveTextContent('A deleted user deleted card "Old"');
  });

  it("says when nothing has changed", async () => {
    vi.mocked(listActivity).mockResolvedValue([]);
    await open();
    expect(await screen.findByText("No changes yet.")).toBeInTheDocument();
  });

  it("shows an error when loading fails", async () => {
    vi.mocked(listActivity).mockRejectedValue(new Error("boom"));
    await open();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("loads again on refresh", async () => {
    vi.mocked(listActivity).mockResolvedValue([]);
    await open();
    await screen.findByText("No changes yet.");
    vi.mocked(listActivity).mockResolvedValue([entry()]);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("list", { name: "Activity" })).toBeInTheDocument();
    expect(listActivity).toHaveBeenCalledTimes(2);
  });

  it("closes again", async () => {
    vi.mocked(listActivity).mockResolvedValue([]);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(screen.queryByText("Recent activity")).not.toBeInTheDocument();
  });
});
