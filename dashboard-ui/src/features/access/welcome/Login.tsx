import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthShell, StatusBanner } from "../primitives";
import { authApi, ApiError } from "../api";
import { notifyAuthChange, safeReturnPath } from "../auth";
import { useQueryClient } from "@tanstack/react-query";

export interface LoginProps {
  onSuccess?: () => void;
  hideShell?: boolean;
}

export function Login({ onSuccess, hideShell = false }: LoginProps) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const location = useLocation();

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Throttling state: countdown in seconds
  const [retryCountdown, setRetryCountdown] = React.useState<number | null>(null);

  // Timer effect for countdown
  React.useEffect(() => {
    if (retryCountdown === null || retryCountdown <= 0) return;
    const timer = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCountdown]);

  const searchParams = new URLSearchParams(location.search);
  const returnUrl = searchParams.get("return") || "/";
  const justRegistered = searchParams.get("registered") === "true";
  const setupComplete = searchParams.get("setup") === "complete";

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!username.trim()) {
      nextErrors.username = "Username is required.";
    }
    if (!password) {
      nextErrors.password = "Password is required.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (retryCountdown !== null && retryCountdown > 0) {
      return;
    }

    if (!validate()) return;

    setSubmitting(true);
    try {
      await client.cancelQueries();
      client.clear();
      await authApi.login(username.trim(), password);
      notifyAuthChange();
      if (onSuccess) {
        onSuccess();
      } else {
        navigate(safeReturnPath(returnUrl), { replace: true });
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          const waitTime = err.retryAfter ?? 60;
          setRetryCountdown(waitTime);
          setServerError(`Too many failed login attempts. Please try again in ${waitTime}s.`);
        } else if (err.status === 401) {
          setServerError("Invalid username or password.");
        } else {
          setServerError(err.message || "Failed to log in.");
        }
      } else {
        setServerError("Invalid username or password.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formContent = (
    <div className="space-y-4">
      {justRegistered && (
        <StatusBanner variant="success">Account registered successfully. Please log in.</StatusBanner>
      )}
      {setupComplete && (
        <StatusBanner variant="success">Server owner claimed successfully. Please log in.</StatusBanner>
      )}

      {retryCountdown !== null && retryCountdown > 0 ? (
        <StatusBanner variant="warning" role="alert">
          Too many failed login attempts. Please try again in {retryCountdown} seconds.
        </StatusBanner>
      ) : (
        serverError && <StatusBanner variant="error">{serverError}</StatusBanner>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1">
          <label htmlFor="login-username" className="block text-sm font-medium">
            Username
            <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="login-username"
            name="username"
            type="text"
            placeholder="username"
            autoComplete="username"
            autoCapitalize="none"
            required
            aria-required="true"
            aria-invalid={Boolean(errors.username)}
            aria-describedby={errors.username ? "login-error-username" : undefined}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (errors.username) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.username;
                  return next;
                });
              }
            }}
            disabled={submitting || (retryCountdown !== null && retryCountdown > 0)}
            className={`w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
              errors.username ? "border-destructive focus:ring-destructive" : "border-input"
            }`}
          />
          {errors.username && (
            <p id="login-error-username" role="alert" className="text-xs text-destructive">
              {errors.username}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="login-password" className="block text-sm font-medium">
            Password
            <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            required
            aria-required="true"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "login-error-password" : undefined}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.password;
                  return next;
                });
              }
            }}
            disabled={submitting || (retryCountdown !== null && retryCountdown > 0)}
            className={`w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
              errors.password ? "border-destructive focus:ring-destructive" : "border-input"
            }`}
          />
          {errors.password && (
            <p id="login-error-password" role="alert" className="text-xs text-destructive">
              {errors.password}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || (retryCountdown !== null && retryCountdown > 0)}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? "Logging in…"
            : retryCountdown !== null && retryCountdown > 0
            ? `Retry in ${retryCountdown}s`
            : "Log in"}
        </button>

        <div className="text-center pt-2">
          <Link
            to="/register"
            className="text-sm font-medium text-primary hover:underline"
          >
            Register instead
          </Link>
        </div>
      </form>
    </div>
  );

  if (hideShell) {
    return formContent;
  }

  return (
    <AuthShell
      title="Log in"
      subtitle="Username and password."
    >
      {formContent}
    </AuthShell>
  );
}

export default Login;
