import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { pollInterval } from "./api";
import * as api from "./api";
import { queryClient } from "../app/providers";
import { ErrorBoundary } from "../components/ErrorBoundary";

it("polls every 3 s only while a job is active, every 30 s otherwise, never while hidden", () => {
  expect(pollInterval([{ status: "running" }], false)).toBe(3000);
  expect(pollInterval([{ status: "queued" }, { status: "done" }], false)).toBe(3000);
  expect(pollInterval([{ status: "done" }], false)).toBe(30000);
  expect(pollInterval(undefined, false)).toBe(30000);
  expect(pollInterval([{ status: "running" }], true)).toBe(false);
});

it("retries a network error once but never a 4xx", () => {
  const retry = queryClient.getDefaultOptions().queries!.retry as (n: number, e: unknown) => boolean;
  expect(retry(0, new TypeError("network"))).toBe(true);
  expect(retry(1, new TypeError("network"))).toBe(false);
  expect(retry(0, new api.ApiError(404, "missing"))).toBe(false);
  expect(queryClient.getDefaultOptions().queries).toMatchObject({ staleTime: 30_000, refetchOnWindowFocus: false });
});

it("passes the abort signal to fetch so switching filters cancels the old request", async () => {
  const seen: AbortSignal[] = [];
  vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
    seen.push(init.signal as AbortSignal);
    return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  }));
  const first = new AbortController();
  const pending = api.health({}, first.signal);
  first.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(seen[0].aborted).toBe(true);
  vi.unstubAllGlobals();
});

it("the error boundary offers Reload and Go to Home instead of a white page", () => {
  expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });
  const boundary = new ErrorBoundary({ children: null });
  boundary.state = { hasError: true };
  const html = renderToStaticMarkup(boundary.render() as never);
  expect(html).toContain("Reload");
  expect(html).toContain('href="/home"');
});
