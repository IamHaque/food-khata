import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";

import { OwnerSettings } from "./OwnerSettings";
function render(isOwner: boolean, users?: unknown[]) {
  const client = new QueryClient();
  client.setQueryData(["auth", "me"], { is_owner: isOwner });
  if (users) client.setQueryData(["owner", "users"], users);
  return renderToString(<QueryClientProvider client={client}><MemoryRouter><OwnerSettings /></MemoryRouter></QueryClientProvider>);
}

describe("owner settings guard", () => {
  it("blocks non-owners without rendering owner controls", () => {

    const html = render(false);
    expect(html).toContain("Owner access required");
    expect(html).not.toContain("Registration window");
  });
  it("shows owner controls and explains one-time code visibility", () => {

    const html = render(true);
    expect(html).toContain("15 min");
    expect(html).toContain("1 hour");
    expect(html).toContain("Until closed");
    expect(html).toContain("existing code cannot be retrieved");
    expect(html).toContain("old code stop working");
  });
  it("offers disable, reset, transfer and remove per other user, with a space after the name", () => {
    const html = render(true, [
      { id: "o", username: "haque", is_owner: true, disabled: false },
      { id: "u", username: "alice", is_owner: false, disabled: false },
    ]);
    for (const text of ["Disable", "Reset password", "Transfer ownership", "Remove"]) expect(html).toContain(text);
    expect(html).toMatch(/haque<\/strong> <span[^>]*>owner/);
  });
});
