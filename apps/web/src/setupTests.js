// NOTE (Phase 3c): jest-dom matchers ARE used in these tests.
// The Phase 2c note above was about the plain `@testing-library/jest-dom`
// import, whose Vitest augmentation does not merge under Vitest 5. The
// fix is the `/vitest` entry point below: it extends expect at runtime
// AND its types augment the `vitest` module (see src/test/jest-dom.d.ts).
// The probe test (src/test/jestDom.test.tsx) pins this — if it ever
// fails typecheck, the suite falls back to Vitest built-ins for DOM
// assertions (toBeNull / .textContent / .value) and this import goes.
import { vi } from 'vitest';
import { server } from './mocks/server';
import { resetCaptured } from './mocks/handlers';
import "@testing-library/jest-dom/vitest";

// Phase 2c: the API is mocked with MSW (node server — axios/XHR in jsdom
// goes through Node http, which the server intercepts). Any request with
// no matching handler fails the test, so an unmocked endpoint cannot
// silently pass. The encryption key / API base are set in
// vitest.config.ts `test.env`; stub them here too so they hold even if
// config env handling changes.
vi.stubEnv('VITE_ENCRYPTED_KEY', 'test-only-encryption-key');
vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:5000');

// jsdom has no window.alert implementation (it logs "Not implemented");
// — stub it so alert() calls in components under test are observable.
window.alert = vi.fn();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  resetCaptured();
  vi.mocked(window.alert).mockClear();
});
afterAll(() => server.close());
