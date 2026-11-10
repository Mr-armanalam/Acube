import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const isTest = process.env.NODE_ENV === "test";

// JSON logs in production (machine-readable); pretty human-readable logs
// in development. Silent in tests so test output stays readable.
const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? "silent" : isDev ? "debug" : "info"),
  ...(isDev && !isTest
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, ignore: "pid,hostname" },
        },
      }
    : {}),
});

export default logger;
