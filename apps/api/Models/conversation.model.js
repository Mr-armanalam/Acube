import { Schema, model } from "mongoose";

const conversationSchema = new Schema(
  {
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    messages: [{ type: Schema.Types.ObjectId, ref: "Message", default: [] }],
  },
  { timestamps: true }
);

// Phase 3b: 1:1 conversations are looked up by participants.
conversationSchema.index({ participants: 1 });

const Conversation = model("Conversation", conversationSchema);

export default Conversation;
