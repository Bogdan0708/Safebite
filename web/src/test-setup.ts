import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest.config's test block does not set `globals: true`, so Testing Library's
// automatic afterEach(cleanup) (which relies on a global `afterEach`) never registers.
// Without this, renders from one test leak into the next.
afterEach(() => {
  cleanup();
});
