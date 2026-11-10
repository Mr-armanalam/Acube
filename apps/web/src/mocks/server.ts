// MSW node server for the web client tests (Phase 2c). Started from
// src/setupTests.js; individual tests override handlers with server.use().
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
