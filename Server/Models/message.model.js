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
      required: true,
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

const Message = model('Message', MessageSchema);

export default Message;