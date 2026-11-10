import { Schema, model } from 'mongoose';

const MessageSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    group: {
      type: Schema.Types.ObjectId,
      ref: "Group",
    },
    content: {
      type: String,
      required: true,
    },
  },
  { timestamps: true } //createdAt , updatedAt => content.createdAt
);

// Phase 3b: message lookups — group threads and 1:1 threads, both
// paged chronologically.
MessageSchema.index({ group: 1, createdAt: 1 });
MessageSchema.index({ sender: 1, receiver: 1, createdAt: 1 });

const Message = model('Message', MessageSchema);

export default Message;