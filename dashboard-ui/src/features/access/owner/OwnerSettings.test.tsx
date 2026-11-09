import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";

import { OwnerSettings } from "./OwnerSettings";
function render(isOwner: boolean) {
  const client = new QueryClient();
  client.setQueryData(["auth", "me"], { is_owner: isOwner });
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
});
