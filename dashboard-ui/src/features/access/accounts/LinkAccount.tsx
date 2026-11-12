import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AppPage, StatusBanner } from "../primitives";
import { accountsApi, ApiError } from "../api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Step = "phone" | "code";

export function LinkAccount() {
  const navigate = useNavigate();
  const timer = React.useRef<ReturnType<typeof setTimeout>>();
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const queryClient = useQueryClient();
  const providers = useQuery({ queryKey: ["accounts", "providers"], queryFn: accountsApi.providers });
  const [provider, setProvider] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [handle, setHandle] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<Step>("phone");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [addedTo, setAddedTo] = React.useState<string | null>(null);

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
      const res = await accountsApi.linkVerify(handle, code);
      if (res.added_to_existing) setAddedTo(`${provider.charAt(0).toUpperCase()}${provider.slice(1)} added to the account for ••••${phone.slice(-4)}`);
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setSuccess(true);
      timer.current = setTimeout(() => navigate("/accounts"), 800);
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
    <AppPage title="Link account" subtitle="Enter your phone number, then the SMS code we send." back={{ to: "/accounts", label: "Accounts" }}>
      <div className="space-y-4">
        {success && <StatusBanner variant="success">{addedTo ?? "Linked successfully"}</StatusBanner>}
        {error && <StatusBanner variant="error">{error}</StatusBanner>}

        {step === "phone" && (
          <form onSubmit={sendCode} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="provider" className="block text-sm font-medium">Provider</label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger id="provider"><SelectValue placeholder="Choose a provider" /></SelectTrigger>
                <SelectContent>
                  {providers.data?.providers.map((p) => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="phone" className="block text-sm font-medium">Phone number</label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting || !provider}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {submitting ? "Sending…" : "Send code"}
            </Button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter the code sent to {phone}.</p>
            <div className="space-y-1">
              <label htmlFor="code" className="block text-sm font-medium">SMS OTP code</label>
              <Input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {submitting ? "Verifying…" : "Verify"}
              </Button>
              <Button variant="outline" type="button" onClick={resetToPhone} className="rounded-md border px-4 py-2 text-sm">
                Back
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppPage>
  );
}
export default LinkAccount;
