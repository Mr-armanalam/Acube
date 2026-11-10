// Phase 3c: jest-dom matchers under Vitest 5.
// jest-dom 6.9.1 ships a `vitest` entry point whose types augment the
// `vitest` module's Assertion interface (the plain `@testing-library/
// jest-dom` import does NOT merge under Vitest 5 — see the note in
// src/setupTests.js). This import pulls those types into the test
// compilation; the runtime side (expect.extend) is the matching import
// in src/setupTests.js. src/test/jestDom.test.tsx pins the behaviour:
// if it ever fails typecheck, the suite falls back to Vitest built-ins.
import "@testing-library/jest-dom/vitest";
