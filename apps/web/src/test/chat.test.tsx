// Chat send (Phase 2b Query mutation): typing a message and sending it
// must POST the message with the selected user's id.
import { vi, describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { RoomContext } from "../context/RoomContext";
import { captured } from "../mocks/handlers";
import { renderWithProviders, testSession } from "./testUtils";
import ChatMain from "../Component/chat/ChatMain";

// RoomContext.jsx opens a real socket.io connection at import time
// (module-level `socketIo(WS)`). Mock the client so no live socket is
// attempted in tests; ChatMain only needs the context value below.
vi.mock("socket.io-client", () => ({
  default: () => ({ on: vi.fn(), emit: vi.fn() }),
}));

describe("Chat send", () => {
  it("sends the typed message to the selected user", async () => {
    const user = userEvent.setup();
    const renderResult = renderWithProviders(
      // RoomContext is typed as createContext(null), so the mock value
      // needs a cast — JoinButton destructures `socket` from it.
      <RoomContext.Provider
        value={{ socket: { emit: () => {} } } as never}
      >
        <ChatMain
          selectedUser={{
            _id: "user2",
            username: "Bob",
            email: "bob@example.com",
          }}
        />
      </RoomContext.Provider>,
      { session: testSession },
    );
    expect(await screen.findByText("Bob")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Type a message"), "hello");
    // The send button is the one inside the message form (the JoinButton
    // video-call button is also a <button> in this component).
    const { container } = renderResult;
    const sendButton = container.querySelector(".c_buttom form button");
    if (!sendButton) throw new Error("send button not found");
    await user.click(sendButton);

    await waitFor(() => expect(captured.chatSend).toHaveLength(1));
    expect(captured.chatSend[0]).toEqual({
      message: "hello",
      recieverId: "user2",
    });
    // The input clears after sending.
    expect(screen.getByPlaceholderText("Type a message")).toHaveValue("");
  });
});
