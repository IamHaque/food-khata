import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell, StatusBanner } from "../primitives";
import { accountsApi, ApiError } from "../api";

type Step = "phone" | "code";

export function LinkAccount() {
  const navigate = useNavigate();
  const [provider, setProvider] = React.useState("fake");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [handle, setHandle] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<Step>("phone");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await accountsApi.linkStart(provider, phone);
      setHandle(res.handle);
      setStep("code");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Failed to send code.");
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle) return;
    setError(null);
    setSubmitting(true);
    try {
      await accountsApi.linkVerify(handle, code);
      setSuccess(true);
      setTimeout(() => navigate("/"), 800);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "HANDLE_EXPIRED" || err.code === "INVALID_HANDLE") {
          setHandle(null);
          setStep("phone");
          setError("Handle expired. Please restart.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Verification failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetToPhone = () => {
    setHandle(null);
    setStep("phone");
    setCode("");
    setError(null);
  };

  return (
    <AuthShell title="Link account" subtitle="Phone number → SMS code.">
      <div className="space-y-4">
        {success && <StatusBanner variant="success">Linked successfully</StatusBanner>}
        {error && <StatusBanner variant="error">{error}</StatusBanner>}

        {step === "phone" && (
          <form onSubmit={sendCode} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="fake">Fake (testing)</option>
                <option value="zomato">Zomato</option>
                <option value="swiggy">Swiggy</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium">Phone number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {submitting ? "Sending…" : "Send code"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter the code sent to {phone}.</p>
            <div className="space-y-1">
              <label className="block text-sm font-medium">SMS OTP code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {submitting ? "Verifying…" : "Verify"}
              </button>
              <button type="button" onClick={resetToPhone} className="rounded-md border px-4 py-2 text-sm">
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
export default LinkAccount;
