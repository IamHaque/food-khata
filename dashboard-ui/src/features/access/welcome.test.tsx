import { describe, expect, it, vi, beforeEach } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Setup } from "./welcome/Setup";
import { Login } from "./welcome/Login";
import { Register } from "./welcome/Register";
import { Welcome } from "./welcome/Welcome";
import { AccessRoutes } from "./routes";
import * as accessApi from "./api";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement, initialPath = "/") {
  const queryClient = createTestQueryClient();
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AC-13 Access Screens", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("warns on an insecure connection before login", () => {
    vi.spyOn(accessApi, "useSetupStatus").mockReturnValue({
      data: { has_owner: true, registration_open: false, insecure_transport: true },
    } as any);
    expect(renderWithProviders(<Login />)).toContain("connection is not encrypted");
  });

  describe("Scenario 1: First run / Setup screen", () => {
    it("renders 'Set up this server' on first run when has_owner is false", () => {
      vi.spyOn(accessApi, "useSetupStatus").mockReturnValue({
        data: { has_owner: false, registration_open: true },
        isLoading: false,
        isError: false,
      } as any);
      vi.spyOn(accessApi, "useOwnerSetupCheck").mockReturnValue({
        data: { has_owner: false, is_loopback: true },
        isLoading: false,
        isError: false,
      } as any);

      const html = renderWithProviders(<Setup />);
      expect(html).toContain("Set up this server");
      expect(html).toContain("Claim owner access");
      expect(html).toContain("Adopt existing .food-khata data");
      expect(html).toContain("Claim owner");
    });

    it("does NOT show setup code field when is_loopback is true (loopback host visitor)", () => {
      vi.spyOn(accessApi, "useSetupStatus").mockReturnValue({
        data: { has_owner: false, registration_open: true },
        isLoading: false,
      } as any);
      vi.spyOn(accessApi, "useOwnerSetupCheck").mockReturnValue({
        data: { has_owner: false, is_loopback: true },
        isLoading: false,
      } as any);

      const html = renderWithProviders(<Setup />);
      expect(html).not.toContain("Setup code (only when not on host)");
      expect(html).not.toContain("field-setup-code");
    });

    it("shows setup code field ONLY when is_loopback is false (network visitor)", () => {
      vi.spyOn(accessApi, "useSetupStatus").mockReturnValue({
        data: { has_owner: false, registration_open: true },
        isLoading: false,
      } as any);
      vi.spyOn(accessApi, "useOwnerSetupCheck").mockReturnValue({
        data: { has_owner: false, is_loopback: false },
        isLoading: false,
      } as any);

      const html = renderWithProviders(<Setup />);
      expect(html).toContain("Setup code (only when not on host)");
      expect(html).toContain("id=\"field-setup-code\"");
      expect(html).toContain("placeholder=\"XXXX-XXXX\"");
    });

    it("redirects away if has_owner is already true", () => {
      vi.spyOn(accessApi, "useSetupStatus").mockReturnValue({
        data: { has_owner: true, registration_open: false },
        isLoading: false,
      } as any);
      vi.spyOn(accessApi, "useOwnerSetupCheck").mockReturnValue({
        data: { has_owner: true, is_loopback: true },
        isLoading: false,
      } as any);

      const html = renderWithProviders(<Setup />);
      // Returns <Navigate to="/login" replace /> which renders empty string in SSR
      expect(html).toBe("");
      expect(html).not.toContain("Claim owner");
    });
  });

  describe("Scenario 2: Welcome / Login screen (DEC-010)", () => {
    it("renders Welcome screen with tab list for Log in and Register when owner exists", () => {
      vi.spyOn(accessApi, "useSetupStatus").mockReturnValue({
        data: { has_owner: true, registration_open: false },
        isLoading: false,
      } as any);

      const html = renderWithProviders(<Welcome />);
      expect(html).toContain("Welcome to Food Khata");
      expect(html).toContain("role=\"tablist\"");
      expect(html).toContain("id=\"tab-login\"");
      expect(html).toContain("id=\"tab-register\"");
      expect(html).toContain("Log in");
      expect(html).toContain("Register");
    });

    it("redirects from Welcome to /setup when has_owner is false", () => {
      vi.spyOn(accessApi, "useSetupStatus").mockReturnValue({
        data: { has_owner: false, registration_open: true },
        isLoading: false,
      } as any);

      const html = renderWithProviders(<Welcome />);
      // Returns <Navigate to="/setup" replace /> which renders empty in SSR
      expect(html).toBe("");
      expect(html).not.toContain("Welcome to Food Khata");
    });

    it("DEC-010: The login screen does NOT display the owner's name", () => {
      const html = renderWithProviders(<Login />);
      expect(html).toContain("Log in");
      expect(html).toContain("Username and password");
      // Must not display owner name or any owner mention
      expect(html).not.toContain("owner:");
      expect(html).not.toContain("Server Owner");
      expect(html).toContain("id=\"login-username\"");
      expect(html).toContain("id=\"login-password\"");
      expect(html).toContain("Register instead");
    });

    it("displays registered banner when ?registered=true", () => {
      const html = renderWithProviders(<Login />, "/login?registered=true");
      expect(html).toContain("Account registered successfully");
    });

    it("displays setup complete banner when ?setup=complete", () => {
      const html = renderWithProviders(<Login />, "/login?setup=complete");
      expect(html).toContain("Server owner claimed successfully");
    });
  });

  describe("Scenario 3: Register screen (DEC-010)", () => {
    it("shows clear status indicator and join code field when registration is closed", () => {
      vi.spyOn(accessApi, "useSetupStatus").mockReturnValue({
        data: { has_owner: true, registration_open: false },
        isLoading: false,
      } as any);

      const html = renderWithProviders(<Register />);
      expect(html).toContain("Registration window is closed");
      expect(html).toContain("A valid join code from the owner is required");
      expect(html).toContain("id=\"reg-join-code\"");
      expect(html).toContain("placeholder=\"ABCD-1234\"");
    });

    it("shows open status banner and hides join code when registration window is open", () => {
      vi.spyOn(accessApi, "useSetupStatus").mockReturnValue({
        data: { has_owner: true, registration_open: true },
        isLoading: false,
      } as any);

      const html = renderWithProviders(<Register />);
      expect(html).toContain("Registration window is open");
      expect(html).not.toContain("id=\"reg-join-code\"");
    });

    it("DEC-010: Registration submit button is disabled by default until the no-recovery checkbox is ticked", () => {
      vi.spyOn(accessApi, "useSetupStatus").mockReturnValue({
        data: { has_owner: true, registration_open: true },
        isLoading: false,
      } as any);

      const html = renderWithProviders(<Register />);
      expect(html).toContain("id=\"norecovery\"");
      expect(html).toContain("I understand there is no recovery if password is lost");
      // regBtn is disabled
      expect(html).toMatch(/<button[^>]*id="regBtn"[^>]*disabled=""/);
    });

    it("provides link to log in instead", () => {
      vi.spyOn(accessApi, "useSetupStatus").mockReturnValue({
        data: { has_owner: true, registration_open: false },
        isLoading: false,
      } as any);

      const html = renderWithProviders(<Register />);
      expect(html).toContain("href=\"/login\"");
      expect(html).toContain("Log in instead");
    });
  });

  describe("Scenario 4: Accessibility & Responsive Quality", () => {
    it("has proper accessible attributes on form inputs and buttons", () => {
      const html = renderWithProviders(<Login />);
      expect(html).toContain("aria-required=\"true\"");
      expect(html).toContain("autoComplete=\"username\"");
      expect(html).toContain("autoComplete=\"current-password\"");
      expect(html).toContain("type=\"password\"");
    });

    it("uses responsive layout container with proper padding", () => {
      const html = renderWithProviders(<Login />);
      expect(html).toContain("max-w-md");
      expect(html).toContain("min-h-screen");
    });

    it("Setup screen has accessible labels and inputs", () => {
      vi.spyOn(accessApi, "useSetupStatus").mockReturnValue({
        data: { has_owner: false, registration_open: true },
        isLoading: false,
      } as any);
      vi.spyOn(accessApi, "useOwnerSetupCheck").mockReturnValue({
        data: { has_owner: false, is_loopback: false },
        isLoading: false,
      } as any);

      const html = renderWithProviders(<Setup />);
      expect(html).toContain("for=\"field-setup-code\"");
      expect(html).toContain("for=\"field-username\"");
      expect(html).toContain("for=\"field-password\"");
      expect(html).toContain("for=\"field-confirm-password\"");
    });
  });

  describe("Scenario 5: Routes Wiring", () => {
    it("renders AccessRoutes without errors", () => {
      const html = renderWithProviders(<AccessRoutes />, "/");
      expect(html).toBeTruthy();
    });
  });

  describe("Api client error handling", () => {
    it("creates ApiError with status, message, code, and retryAfter", () => {
      const err = new accessApi.ApiError(429, "Too many login attempts", "too_many_requests", 45);
      expect(err.status).toBe(429);
      expect(err.code).toBe("too_many_requests");
      expect(err.retryAfter).toBe(45);
      expect(err.message).toBe("Too many login attempts");
    });
  });
});
