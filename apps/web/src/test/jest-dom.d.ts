// Phase 3c: jest-dom matchers under Vitest 5.
// jest-dom 6.9.1 ships a `vitest` entry point whose types augment the
// `vitest` module's Assertion interface (the plain `@testing-library/
// jest-dom` import does NOT merge under Vitest 5 — see the note in
// src/setupTests.js). This import pulls those types into the test
// compilation; the runtime side (expect.extend) is the matching import
// in src/setupTests.js. src/test/jestDom.test.tsx pins the behaviour:
// if it ever fails typecheck, the suite falls back to Vitest built-ins.
import "@testing-library/jest-dom/vitest";

// CI typecheck fix (PR #2): jest-dom's own types/vitest.d.ts augments
// `vitest` via `declare module 'vitest'`, but under pnpm that augmentation
// binds to whichever vitest copy the file resolves to. The workspace has
// two vitest@5.1.0 copies in the pnpm store (web's with @types/node
// 22.20.5, api's with @types/node 26.6.6 via stripe), and on a fresh
// install jest-dom's augmentation lands on the 26-copy while test files
// import vitest from apps/web/node_modules/vitest (the 22-copy) — so
// `toBeInTheDocument` etc. are missing from Assertion and tsc fails
// with 267x TS2339, even though it passes locally by luck (install-
// dependent symlink target). This local declaration mirrors jest-dom's
// own augmentation verbatim (same interfaces, same `T = any` header —
// that is jest-dom's declaration, not a new loosening) but lives under
// apps/web/src, so its `declare module "vitest"` resolves deterministically
// to web's vitest copy — the same copy the test files use. No ts-ignore,
// no test exclusion; the augmentation is duplicated, not replaced, so the
// original import above stays.
import {type TestingLibraryMatchers} from "@testing-library/jest-dom/matchers";

// The two rules below are disabled for this block only: the empty
// extending interfaces and the `any` type parameters are verbatim from
// jest-dom's own upstream declaration (types/vitest.d.ts) — interface
// merging requires the empty bodies, and changing `any` would change
// the matcher signatures. This is an ESLint suppression for a vendored
// upstream declaration, not a ts-ignore and not a test exclusion.
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any */
declare module "vitest" {
  interface Assertion<T = any>
    extends TestingLibraryMatchers<
      any,
      T
    > {}
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<
      any,
      any
    > {}
}
/* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any */
