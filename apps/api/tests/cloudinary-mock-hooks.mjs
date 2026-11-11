// Node module-customization hooks (node:module `register`) — redirect
// every `cloudinary` import in this process to the test mock
// (cloudinary-mock.mjs). Registered via cloudinary-mock-register.mjs
// with `node --import`; see the Playwright Cloudinary-path config
// (apps/web/playwright.phase5-cloudinary.config.ts).
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudinary") {
    return {
      url: new URL("./cloudinary-mock.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
