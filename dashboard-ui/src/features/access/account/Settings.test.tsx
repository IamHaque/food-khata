import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";

function render(isOwner: boolean) {
  const client = new QueryClient();
  client.setQueryData(["auth", "me"], { id: "u", username: "alice", is_owner: isOwner });
  return renderToString(<QueryClientProvider client={client}><MemoryRouter><Settings /></MemoryRouter></QueryClientProvider>);
}

// MemoryRouter warns about useLayoutEffect on every server render; keep the test log under verify.mjs's 1 MB buffer.
beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("settings page", () => {
  it("gives every user the Account section with labelled password inputs and log out of all sessions", () => {
    const html = render(false);
    for (const text of ["Account", "Current password", "New password", "Change password", "Log out all sessions"]) expect(html).toContain(text);
    expect(html).not.toContain("Owner settings");
  });
  it("adds the owner section for the owner", () => {
    expect(render(true)).toContain("Owner settings");
  });
});
