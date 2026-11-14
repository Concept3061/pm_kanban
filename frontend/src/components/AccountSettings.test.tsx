import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSettings } from "@/components/AccountSettings";
import { ApiError, changePassword, deleteAccount } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
}));

const onAccountDeleted = vi.fn();

const open = async () => {
  render(<AccountSettings onAccountDeleted={onAccountDeleted} />);
  await userEvent.click(screen.getByRole("button", { name: "Account" }));
};

const changeForm = async (current: string, next: string) => {
  await userEvent.type(screen.getByLabelText("Current password"), current);
  await userEvent.type(screen.getByLabelText("New password"), next);
  await userEvent.click(screen.getByRole("button", { name: "Change password" }));
};

const deleteForm = async (password: string) => {
  await userEvent.type(screen.getByLabelText("Confirm with your password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
};

describe("AccountSettings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("is closed until opened", async () => {
    render(<AccountSettings onAccountDeleted={onAccountDeleted} />);
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
  });

  it("changes the password and clears the form", async () => {
    vi.mocked(changePassword).mockResolvedValue(undefined);
    await open();
    await changeForm("password", "password2");
    expect(changePassword).toHaveBeenCalledWith("password", "password2");
    expect(await screen.findByRole("status")).toHaveTextContent(/password changed/i);
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it.each([
    [403, /incorrect/i],
    [422, /at least 8 characters/i],
    [500, /could not change/i],
  ])("explains a failed password change (%s)", async (status, message) => {
    vi.mocked(changePassword).mockRejectedValue(new ApiError(status, "failed"));
    await open();
    await changeForm("password", "password2");
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("deletes the account after confirming", async () => {
    vi.mocked(deleteAccount).mockResolvedValue(undefined);
    await open();
    await deleteForm("password");
    expect(deleteAccount).toHaveBeenCalledWith("password");
    expect(onAccountDeleted).toHaveBeenCalled();
  });

  it("does nothing when deletion is not confirmed", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    await open();
    await deleteForm("password");
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });

  it("stays signed in when the password is wrong", async () => {
    vi.mocked(deleteAccount).mockRejectedValue(new ApiError(403, "failed"));
    await open();
    await deleteForm("wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect/i);
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });
});
