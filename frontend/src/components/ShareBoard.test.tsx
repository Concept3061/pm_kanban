import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareBoard } from "@/components/ShareBoard";
import { ApiError, listMembers, shareBoard, unshareBoard } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listMembers: vi.fn(),
  shareBoard: vi.fn(),
  unshareBoard: vi.fn(),
}));

const onLeave = vi.fn();

const owner = { username: "user", role: "owner" as const };
const friend = { username: "friend", role: "editor" as const };

const openPanel = async () => {
  render(<ShareBoard boardId={7} isOwner onLeave={onLeave} />);
  await userEvent.click(screen.getByRole("button", { name: "Share" }));
  return screen.findByRole("list", { name: "Members" });
};

describe("ShareBoard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listMembers).mockResolvedValue([owner, friend]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("lists the owner and members when opened", async () => {
    const list = await openPanel();
    expect(listMembers).toHaveBeenCalledWith(7);
    expect(await within(list).findByText("friend")).toBeInTheDocument();
    expect(within(list).getByText("Owner")).toBeInTheDocument();
    expect(within(list).getByLabelText("Role of friend")).toHaveValue("editor");
    // The owner has no role or remove controls.
    expect(within(list).queryByLabelText("Role of user")).not.toBeInTheDocument();
  });

  it("does not load members until opened", () => {
    render(<ShareBoard boardId={7} isOwner onLeave={onLeave} />);
    expect(listMembers).not.toHaveBeenCalled();
  });

  it("shares with a user and refreshes the list", async () => {
    vi.mocked(shareBoard).mockResolvedValue({ username: "pat", role: "viewer" });
    await openPanel();
    vi.mocked(listMembers).mockResolvedValue([owner, friend, { username: "pat", role: "viewer" }]);
    await userEvent.type(screen.getByLabelText("Username"), "  pat ");
    await userEvent.selectOptions(screen.getByLabelText("Access"), "viewer");
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    expect(shareBoard).toHaveBeenCalledWith(7, "pat", "viewer");
    expect(await screen.findByText("pat")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveValue("");
  });

  it("changes a role", async () => {
    vi.mocked(shareBoard).mockResolvedValue({ username: "friend", role: "viewer" });
    await openPanel();
    await userEvent.selectOptions(await screen.findByLabelText("Role of friend"), "viewer");
    expect(shareBoard).toHaveBeenCalledWith(7, "friend", "viewer");
  });

  it("removes a member", async () => {
    vi.mocked(unshareBoard).mockResolvedValue(undefined);
    await openPanel();
    vi.mocked(listMembers).mockResolvedValue([owner]);
    await userEvent.click(await screen.findByRole("button", { name: "Remove friend" }));
    expect(unshareBoard).toHaveBeenCalledWith(7, "friend");
    await vi.waitFor(() => expect(screen.queryByText("friend")).not.toBeInTheDocument());
  });

  it.each([
    [404, /no user with that username/i],
    [409, /already own/i],
    [500, /could not update sharing/i],
  ])("explains a failed share (%s)", async (status, message) => {
    vi.mocked(shareBoard).mockRejectedValue(new ApiError(status, "failed"));
    await openPanel();
    await userEvent.type(screen.getByLabelText("Username"), "nobody");
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("offers members who are not the owner a way to leave", async () => {
    render(<ShareBoard boardId={7} isOwner={false} onLeave={onLeave} />);
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Leave board" }));
    expect(onLeave).toHaveBeenCalled();
    expect(listMembers).not.toHaveBeenCalled();
  });

  it("stays on the board when leaving is not confirmed", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<ShareBoard boardId={7} isOwner={false} onLeave={onLeave} />);
    await userEvent.click(screen.getByRole("button", { name: "Leave board" }));
    expect(onLeave).not.toHaveBeenCalled();
  });
});
