import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";

const renderSidebar = (onSend = vi.fn().mockResolvedValue("Reply"), isOpen = true) => {
  const onClose = vi.fn();
  const view = render(<ChatSidebar isOpen={isOpen} onClose={onClose} onSend={onSend} />);
  return { onSend, onClose, ...view };
};

const input = () => screen.getByLabelText("Message the assistant");

describe("ChatSidebar", () => {
  it("sends a message and shows the reply", async () => {
    const { onSend } = renderSidebar();
    await userEvent.type(input(), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(await screen.findByText("Reply")).toBeInTheDocument();
    expect(onSend).toHaveBeenCalledWith("Hello", []);
    expect(input()).toHaveValue("");
  });

  it("sends earlier messages as history", async () => {
    const onSend = vi
      .fn()
      .mockResolvedValueOnce("First reply")
      .mockResolvedValueOnce("Second reply");
    renderSidebar(onSend);
    await userEvent.type(input(), "First{Enter}");
    await screen.findByText("First reply");
    await userEvent.type(input(), "Second{Enter}");
    await screen.findByText("Second reply");

    expect(onSend).toHaveBeenLastCalledWith("Second", [
      { role: "user", content: "First" },
      { role: "assistant", content: "First reply" },
    ]);
  });

  it("does not send blank messages", async () => {
    const { onSend } = renderSidebar();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.type(input(), "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("adds a new line with shift and enter", async () => {
    const { onSend } = renderSidebar();
    await userEvent.type(input(), "One{Shift>}{Enter}{/Shift}Two");
    expect(input()).toHaveValue("One\nTwo");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows a thinking indicator and blocks a second send while waiting", async () => {
    let finish = () => {};
    const onSend = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = () => resolve("Done");
        })
    );
    renderSidebar(onSend);
    await userEvent.type(input(), "First{Enter}");
    expect(screen.getByRole("status")).toBeInTheDocument();
    await userEvent.type(input(), "Second{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);

    finish();
    expect(await screen.findByText("Done")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("restores the message and shows an error when sending fails", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("failed"));
    renderSidebar(onSend);
    await userEvent.type(input(), "Hello{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not respond/i);
    expect(input()).toHaveValue("Hello");
    expect(screen.queryByTestId("chat-user")).not.toBeInTheDocument();
  });

  it("renders replies as text, not HTML", async () => {
    renderSidebar(vi.fn().mockResolvedValue("<img src=x alt=injected>"));
    await userEvent.type(input(), "Hello{Enter}");
    expect(await screen.findByText("<img src=x alt=injected>")).toBeInTheDocument();
    expect(screen.queryByAltText("injected")).not.toBeInTheDocument();
  });

  it("keeps the conversation while closed", async () => {
    const onSend = vi.fn().mockResolvedValue("Reply");
    const onClose = vi.fn();
    const { rerender } = render(<ChatSidebar isOpen onClose={onClose} onSend={onSend} />);
    await userEvent.type(input(), "Hello{Enter}");
    await screen.findByText("Reply");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();

    rerender(<ChatSidebar isOpen={false} onClose={onClose} onSend={onSend} />);
    rerender(<ChatSidebar isOpen onClose={onClose} onSend={onSend} />);
    await waitFor(() => expect(screen.getByText("Reply")).toBeInTheDocument());
  });
});
