import { expect, it, vi } from "vitest";
import { safeReturnPath } from "./index";

it("keeps a same-origin return path, drops other users' filter ids, and falls back to /accounts", () => {
  vi.stubGlobal("window", { location: { origin: "http://x.test" } });
  expect(safeReturnPath("/orders?sort=date&account_ids=a")).toBe("/orders?sort=date");
  for (const bad of ["https://evil.example/x", "//evil.example", "orders", ""]) expect(safeReturnPath(bad)).toBe("/accounts");
  vi.unstubAllGlobals();
});
