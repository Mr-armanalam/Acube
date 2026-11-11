// Test-only mock of the `cloudinary` npm package, installed via the
// Node module-customization hook in cloudinary-mock-hooks.mjs (see
// cloudinary-mock-register.mjs). Used ONLY by the Playwright
// Cloudinary-path e2e
// (apps/web/e2e-phase5/upload-wizard-cloudinary.spec.ts), never by the
// app itself: the real SDK would attempt a real network upload to
// api.cloudinary.com, which no test may do.
//
// Behaviour mirrors the real SDK where it matters: config() merges
// into the SDK's global config, and uploader.upload() throws
// "Must supply api_key" when no api_key was ever configured. Every
// call is recorded to the JSON file at CLOUDINARY_MOCK_OUT (default
// <tmpdir>/acube-cloudinary-mock-out.json) so the spec can assert the
// SDK was configured with the env values. All values here are
// obviously-fake placeholders; no real credentials anywhere.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT_PATH =
  process.env.CLOUDINARY_MOCK_OUT ||
  path.join(os.tmpdir(), "acube-cloudinary-mock-out.json");

const state = { configCalls: [], uploads: [] };

function record() {
  try {
    fs.writeFileSync(OUT_PATH, JSON.stringify(state, null, 2));
  } catch {
    // A failed record must never crash the server under test; the spec
    // failing to read the file is the signal instead.
  }
}

let configured = {};

const config = (cfg) => {
  if (cfg === undefined) return { ...configured };
  configured = { ...configured, ...cfg };
  state.configCalls.push({ ...cfg });
  record();
  return { ...configured };
};

const upload = async (localFilePath, options) => {
  if (!configured.api_key) {
    throw new Error("Must supply api_key");
  }
  const cloudName = configured.cloud_name ?? "test-cloud-name";
  const response = {
    secure_url: `https://res.cloudinary.com/${cloudName}/video/upload/v1/e2e.mp4`,
    url: `http://res.cloudinary.com/${cloudName}/video/upload/v1/e2e.mp4`,
    duration: 12.5,
    thumbnail_url: `https://res.cloudinary.com/${cloudName}/image/upload/v1/e2e.jpg`,
  };
  state.uploads.push({
    localFilePath,
    options: options ?? {},
    configured: { ...configured },
  });
  record();
  return response;
};

export const v2 = { config, uploader: { upload } };
