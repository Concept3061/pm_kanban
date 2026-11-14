import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/AuthGate";
import { ApiError, getBoard, getMe, login, logout } from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getBoard: vi.fn(),
}));

const signIn = async (username: string, password: string) => {
  await userEvent.type(await screen.findByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
};

describe("AuthGate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getBoard).mockResolvedValue(initialData);
    vi.mocked(logout).mockResolvedValue(undefined);
  });

  it("shows the login form when there is no session", async () => {
    vi.mocked(getMe).mockRejectedValue(new ApiError(401, "failed"));
    render(<AuthGate />);
    expect(await screen.findByLabelText("Username")).toBeInTheDocument();
    expect(screen.queryByTestId(/column-/)).not.toBeInTheDocument();
    expect(getBoard).not.toHaveBeenCalled();
  });

  it("shows the board when already signed in", async () => {
    vi.mocked(getMe).mockResolvedValue({ username: "user" });
    render(<AuthGate />);
    expect(await screen.findAllByTestId(/column-/)).toHaveLength(5);
  });

  it("shows nothing until the session check finishes", () => {
    vi.mocked(getMe).mockReturnValue(new Promise(() => {}));
    const { container } = render(<AuthGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it("signs in and shows the board", async () => {
    vi.mocked(getMe).mockRejectedValue(new ApiError(401, "failed"));
    vi.mocked(login).mockResolvedValue({ username: "user" });
    render(<AuthGate />);
    await signIn("user", "password");
    expect(login).toHaveBeenCalledWith("user", "password");
    expect(await screen.findAllByTestId(/column-/)).toHaveLength(5);
  });

  it("shows an error for wrong credentials", async () => {
    vi.mocked(getMe).mockRejectedValue(new ApiError(401, "failed"));
    vi.mocked(login).mockRejectedValue(new ApiError(401, "failed"));
    render(<AuthGate />);
    await signIn("user", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid username or password/i);
    expect(screen.queryByTestId(/column-/)).not.toBeInTheDocument();
  });

  it("shows a different error when the server fails", async () => {
    vi.mocked(getMe).mockRejectedValue(new ApiError(401, "failed"));
    vi.mocked(login).mockRejectedValue(new ApiError(500, "failed"));
    render(<AuthGate />);
    await signIn("user", "password");
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not sign in/i);
  });

  it("returns to the login form after logging out", async () => {
    vi.mocked(getMe).mockResolvedValue({ username: "user" });
    render(<AuthGate />);
    await userEvent.click(await screen.findByRole("button", { name: "Log out" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Username")).toBeInTheDocument()
    );
    expect(screen.queryByTestId(/column-/)).not.toBeInTheDocument();
  });
});
