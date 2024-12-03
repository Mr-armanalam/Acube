import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import videoroutes from "./Routes/video.js";
import userroutes from "./Routes/User.js";
import path from "path";
import commentroutes from "./Routes/comment.js";
import chatroutes from "./Routes/chat.js";
import cookieParser from "cookie-parser";
import downloadVid from './Routes/downloadVid.js'
import { Server } from "socket.io";
import { createServer } from "http";
import { roomhandler } from "./V-Stream-Room/Roomhandler.js";

dotenv.config();
const app = express();
app.use(cookieParser());

app.use(cors());
app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
app.use("/uploads", express.static(path.join("uploads")));

app.get("/", (req, res) => {
  res.send("Your tube is working");
});

app.use(bodyParser.json());
app.use("/user", userroutes);
app.use("/video", videoroutes);
app.use("/comment", commentroutes);
app.use("/chat", chatroutes);
app.use("/download", downloadVid);

const PORT = process.env.PORT || 5000;

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

const server = createServer(app);
const io = new Server(server,
  {cors: {
    origin: "*",
    method: ["GET", "POST"],
    credentials: true
  }}
);

const users = {};

io.on("connection", (socket) => {
  console.log("User connected");
  roomhandler(socket, io, users);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    for (let userId in users) {
      if (users[userId] === socket.id) {
        delete users[userId];
        break;
      }
    }
  });
});


server.listen(PORT, () => {
  console.log(`Server running on Port ${PORT}`);
});
const DB_URL = process.env.DB_URL;
mongoose
  .connect(DB_URL)
  .then(() => {
    console.log("Mongodb Database connected");
  })
  .catch((error) => {
    console.log(error);
  });

