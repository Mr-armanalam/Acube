// Entry point: connect to MongoDB BEFORE listening (previously the server
// listened first and connected afterwards, so it could serve requests with
// no database), then start the HTTP + Socket.IO server.
// Env is loaded by app.js (dotenv.config runs there before routes are built).
import mongoose from "mongoose";
import { createServer } from "http";
import { Server } from "socket.io";
import app, { corsOptions } from "./app.js";
import { roomhandler } from "./V-Stream-Room/Roomhandler.js";
import logger from "./utils/logger.js";

const PORT = process.env.PORT || 5000;
const DB_URL = process.env.DB_URL;

const server = createServer(app);
const io = new Server(server, {
  cors: { ...corsOptions, methods: ["GET", "POST"] },
});

const users = {};

io.on("connection", (socket) => {
  roomhandler(socket, io, users);

  socket.on("disconnect", () => {
    for (const userId in users) {
      if (users[userId] === socket.id) {
        delete users[userId];
        break;
      }
    }
  });
});

async function start() {
  if (!DB_URL) {
    logger.error("DB_URL is not set — copy .env.example to .env and fill it in");
    process.exit(1);
  }
  try {
    await mongoose.connect(DB_URL);
    logger.info("MongoDB connected");
  } catch (error) {
    logger.error({ err: error }, "Failed to connect to MongoDB");
    process.exit(1);
  }

  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal} — shutting down gracefully`);
  server.close(async () => {
    try {
      await mongoose.connection.close();
      logger.info("MongoDB connection closed");
    } catch (error) {
      logger.error({ err: error }, "Error closing MongoDB connection");
    }
    process.exit(0);
  });
  // Force exit if connections hang.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

start();
