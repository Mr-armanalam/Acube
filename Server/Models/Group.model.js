import { Schema, model } from "mongoose";

const groupSchema = new Schema(
  {
    name: { type: String, required: true },
    GroupPicture: {type: String },
    admin: [{ type: Schema.Types.ObjectId, ref: "User" }],
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
    messages: [{ type: Schema.Types.ObjectId, ref: "Message", default: [] }],
  },
  { timestamps: true }
);

const Group = model("Group", groupSchema);

export default Group;
