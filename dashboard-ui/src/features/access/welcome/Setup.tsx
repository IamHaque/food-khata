import * as React from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { AuthShell, StatusBanner } from "../primitives";
import { ownerApi, useSetupStatus, useOwnerSetupCheck, ApiError } from "../api";

export interface SetupProps {
  onSuccess?: () => void;
}

export function Setup({ onSuccess }: SetupProps) {
  const navigate = useNavigate();
  const setupStatus = useSetupStatus();
  const ownerCheck = useOwnerSetupCheck();

  const [setupCode, setSetupCode] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [adoptData, setAdoptData] = React.useState(true);

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // If owner already exists according to setup-status, redirect to login
  if (setupStatus.data && setupStatus.data.has_owner) {
    return <Navigate to="/login" replace />;
  }

  // is_loopback defaults to true until check completes; if false, show setup code
  const isLoopback = ownerCheck.data?.is_loopback ?? true;
  const showSetupCode = !isLoopback;

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (showSetupCode && !setupCode.trim()) {
      nextErrors.setup_code = "Setup code is required for remote setup.";
    }

    if (!username.trim()) {
      nextErrors.username = "Username is required.";
    } else if (username.trim().length < 3) {
      nextErrors.username = "Username must be at least 3 characters.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    if (!confirmPassword) {
      nextErrors.confirm_password = "Confirm password is required.";
    } else if (password !== confirmPassword) {
      nextErrors.confirm_password = "Passwords do not match.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setSubmitting(true);
    try {
      await ownerApi.setup({
        username: username.trim(),
        password,
        setup_code: showSetupCode ? setupCode.trim() : undefined,
        adopt_data: adoptData,
      });

      if (onSuccess) {
        onSuccess();
      } else {
        navigate("/login?setup=complete", { replace: true });
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setServerError(err.message || "Failed to set up server.");
      } else {
        setServerError("An unexpected error occurred during setup.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Set up this server"
      subtitle="Claim owner access. From loopback or with the one-time setup code printed at --lan start."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {serverError && <StatusBanner variant="error">{serverError}</StatusBanner>}

        {showSetupCode && (
          <div className="space-y-1">
            <label htmlFor="field-setup-code" className="block text-sm font-medium">
              Setup code (only when not on host)
              <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="field-setup-code"
              name="setup_code"
              type="text"
              placeholder="XXXX-XXXX"
              required
              aria-required="true"
              aria-invalid={Boolean(errors.setup_code)}
              aria-describedby={errors.setup_code ? "error-setup-code" : undefined}
              value={setupCode}
              onChange={(e) => {
                setSetupCode(e.target.value);
                if (errors.setup_code) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.setup_code;
                    return next;
                  });
                }
              }}
              disabled={submitting}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                errors.setup_code ? "border-destructive focus:ring-destructive" : "border-input"
              }`}
            />
            {errors.setup_code && (
              <p id="error-setup-code" role="alert" className="text-xs text-destructive">
                {errors.setup_code}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="field-username" className="block text-sm font-medium">
            Username
            <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="field-username"
            name="username"
            type="text"
            placeholder="owner"
            autoComplete="username"
            required
            aria-required="true"
            aria-invalid={Boolean(errors.username)}
            aria-describedby={errors.username ? "error-username" : undefined}
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
            disabled={submitting}
            className={`w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
              errors.username ? "border-destructive focus:ring-destructive" : "border-input"
            }`}
          />
          {errors.username && (
            <p id="error-username" role="alert" className="text-xs text-destructive">
              {errors.username}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="field-password" className="block text-sm font-medium">
            Password
            <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="field-password"
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            required
            aria-required="true"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "error-password" : undefined}
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
            disabled={submitting}
            className={`w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
              errors.password ? "border-destructive focus:ring-destructive" : "border-input"
            }`}
          />
          {errors.password && (
            <p id="error-password" role="alert" className="text-xs text-destructive">
              {errors.password}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="field-confirm-password" className="block text-sm font-medium">
            Confirm password
            <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="field-confirm-password"
            name="confirm_password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            required
            aria-required="true"
            aria-invalid={Boolean(errors.confirm_password)}
            aria-describedby={errors.confirm_password ? "error-confirm-password" : undefined}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (errors.confirm_password) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.confirm_password;
                  return next;
                });
              }
            }}
            disabled={submitting}
            className={`w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
              errors.confirm_password ? "border-destructive focus:ring-destructive" : "border-input"
            }`}
          />
          {errors.confirm_password && (
            <p id="error-confirm-password" role="alert" className="text-xs text-destructive">
              {errors.confirm_password}
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            name="adopt_data"
            checked={adoptData}
            onChange={(e) => setAdoptData(e.target.checked)}
            disabled={submitting}
            className="rounded border-input text-primary focus:ring-ring"
          />
          <span>Adopt existing .food-khata data</span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Claiming owner…" : "Claim owner"}
        </button>
      </form>
    </AuthShell>
  );
}

export default Setup;
