import React from "react";
import "./chat_main.css";
import { MdChatBubble } from "react-icons/md";
import type { SessionProfile } from "../../types";

const NoChatMain = ({
  navigate,
  currentUser,
}: {
  navigate: { main?: string };
  currentUser: SessionProfile | null;
}) => {
  return (
    <section className={`No_Chat_main_container ${navigate?.main}`}>
      <div className="No_chat_box">
        <MdChatBubble size={110} />
        <h2>Welcome to Your Chats</h2>
        <h3>{`Please ${
          currentUser ? "Select" : "Login"
        } to start your conversation `}</h3>
      </div>
      {/* Phase 3c: honest wording — chat messages are encrypted with a
          single shared server-side key (SECRETKEY_CRYPTO), so this is
          TLS + server-side encryption at rest, NOT end-to-end. The old
          "End-to-End Encripted" label was wrong. */}
      <h4>TLS + server-side encryption at rest, NOT end-to-end</h4>
    </section>
  );
};

export default NoChatMain;
