// Loaded with `node --import` before the e2e server entry point:
// installs the `cloudinary` → mock redirect
// (cloudinary-mock-hooks.mjs) for the whole process, so the API server
// under test uses the mocked SDK instead of the real one.
import { register } from "node:module";

register("./cloudinary-mock-hooks.mjs", import.meta.url);
