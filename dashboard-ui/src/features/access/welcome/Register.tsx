import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell, StatusBanner } from "../primitives";
import { authApi, useSetupStatus, ApiError } from "../api";

export interface RegisterProps {
  onSuccess?: () => void;
  hideShell?: boolean;
}

export function Register({ onSuccess, hideShell = false }: RegisterProps) {
  const navigate = useNavigate();
  const setupStatus = useSetupStatus();

  const [joinCode, setJoinCode] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [noRecovery, setNoRecovery] = React.useState(false);

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [retryCountdown, setRetryCountdown] = React.useState<number | null>(null);

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

  const isRegistrationOpen = setupStatus.data?.registration_open ?? false;
  const isSetupStatusLoaded = !setupStatus.isLoading;

  // Show join code input if window is not open, or keep optional if open
  // Requirement: "join code (optional/hidden if window is open)"
  const showJoinCodeField = !isRegistrationOpen;

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!isRegistrationOpen && !joinCode.trim()) {
      nextErrors.join_code = "A join code is required when registration window is closed.";
    }

    if (!username.trim()) {
      nextErrors.username = "Username is required.";
    } else if (username.trim().length < 3) {
      nextErrors.username = "Username must be at least 3 characters.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (password.length < 10) {
      nextErrors.password = "Password must be at least 10 characters.";
    }

    if (!confirmPassword) {
      nextErrors.confirm_password = "Confirm password is required.";
    } else if (password !== confirmPassword) {
      nextErrors.confirm_password = "Passwords do not match.";
    }

    if (!noRecovery) {
      nextErrors.no_recovery = "You must acknowledge that there is no password recovery.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (retryCountdown !== null && retryCountdown > 0) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      await authApi.register(
        username.trim(),
        password,
        joinCode.trim() ? joinCode.trim() : undefined,
      );

      if (onSuccess) {
        onSuccess();
      } else {
        navigate("/login?registered=true", { replace: true });
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          const wait = err.retryAfter ?? 60;
          setRetryCountdown(wait);
          setServerError(`Too many registration attempts. Please try again in ${wait}s.`);
        } else {
          setServerError(err.message || "Registration failed.");
        }
      } else {
        setServerError("An unexpected error occurred during registration.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formContent = (
    <div className="space-y-4">
      {isSetupStatusLoaded && !isRegistrationOpen && !joinCode.trim() && (
        <StatusBanner variant="warning" role="status">
          Registration window is closed. A valid join code from the owner is required.
        </StatusBanner>
      )}

      {isSetupStatusLoaded && isRegistrationOpen && (
        <StatusBanner variant="info" role="status">
          Registration window is open. You can register without a join code.
        </StatusBanner>
      )}

      {retryCountdown !== null && retryCountdown > 0 ? (
        <StatusBanner variant="warning" role="alert">
          Too many registration attempts. Please try again in {retryCountdown} seconds.
        </StatusBanner>
      ) : (
        serverError && <StatusBanner variant="error">{serverError}</StatusBanner>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {showJoinCodeField && (
          <div className="space-y-1">
            <label htmlFor="reg-join-code" className="block text-sm font-medium">
              Join code
              <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="reg-join-code"
              name="join_code"
              type="text"
              placeholder="ABCD-1234"
              required={!isRegistrationOpen}
              aria-required={!isRegistrationOpen}
              aria-invalid={Boolean(errors.join_code)}
              aria-describedby={errors.join_code ? "reg-error-join-code" : undefined}
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value);
                if (errors.join_code) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.join_code;
                    return next;
                  });
                }
              }}
              disabled={submitting}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                errors.join_code ? "border-destructive focus:ring-destructive" : "border-input"
              }`}
            />
            {errors.join_code && (
              <p id="reg-error-join-code" role="alert" className="text-xs text-destructive">
                {errors.join_code}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="reg-username" className="block text-sm font-medium">
            Username
            <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="reg-username"
            name="username"
            type="text"
            placeholder="username"
            autoComplete="username"
            autoCapitalize="none"
            required
            aria-required="true"
            aria-invalid={Boolean(errors.username)}
            aria-describedby={errors.username ? "reg-error-username" : undefined}
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
            <p id="reg-error-username" role="alert" className="text-xs text-destructive">
              {errors.username}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="reg-password" className="block text-sm font-medium">
            Password
            <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
          </label>
          <p id="reg-password-rule" className="text-xs text-muted-foreground">
            At least 10 characters, not your username, and not a common password.
          </p>
          <input
            id="reg-password"
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            required
            aria-required="true"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "reg-error-password" : undefined}
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
            <p id="reg-error-password" role="alert" className="text-xs text-destructive">
              {errors.password}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="reg-confirm-password" className="block text-sm font-medium">
            Confirm password
            <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="reg-confirm-password"
            name="confirm_password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            required
            aria-required="true"
            aria-invalid={Boolean(errors.confirm_password)}
            aria-describedby={errors.confirm_password ? "reg-error-confirm-password" : undefined}
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
            <p id="reg-error-confirm-password" role="alert" className="text-xs text-destructive">
              {errors.confirm_password}
            </p>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            id="norecovery"
            name="no_recovery"
            checked={noRecovery}
            onChange={(e) => {
              setNoRecovery(e.target.checked);
              if (errors.no_recovery) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.no_recovery;
                  return next;
                });
              }
            }}
            disabled={submitting}
            className="mt-0.5 rounded border-input text-primary focus:ring-ring"
          />
          <span className="text-sm">
            I understand there is no recovery if password is lost
          </span>
        </label>
        {errors.no_recovery && (
          <p id="reg-error-no-recovery" role="alert" className="text-xs text-destructive">
            {errors.no_recovery}
          </p>
        )}

        <button
          type="submit"
          id="regBtn"
          disabled={!noRecovery || submitting || (retryCountdown !== null && retryCountdown > 0)}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? "Registering…"
            : retryCountdown !== null && retryCountdown > 0
            ? `Retry in ${retryCountdown}s`
            : "Register"}
        </button>

        <div className="text-center pt-2">
          <Link
            to="/login"
            className="text-sm font-medium text-primary hover:underline"
          >
            Log in instead
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
      title="Register"
      subtitle="Join with a household join code."
    >
      {formContent}
    </AuthShell>
  );
}

export default Register;
