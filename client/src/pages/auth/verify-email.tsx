import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, MailCheck } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import heroBg from "@/assets/images/hero-login-bg.jpeg";
import { usePageTracking } from "@/hooks/use-page-tracking";

type VerifyResponse = {
  success: true;
  email: string;
  name: string | null;
  passwordSetToken: string;
};

type Stage = "verifying" | "set-password" | "success" | "error";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export default function VerifyEmailPage() {
  usePageTracking("/verify-email");
  const [, setLocation] = useLocation();

  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [stage, setStage] = useState<Stage>(token ? "verifying" : "error");
  const [error, setError] = useState(token ? "" : "This link is missing a verification token. Please use the link from your invitation email.");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [passwordSetToken, setPasswordSetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const verifyMutation = useMutation({
    mutationFn: () => postJson<VerifyResponse>("/api/auth/verify-email", { token }),
    onSuccess: (data) => {
      setEmail(data.email);
      setDisplayName(data.name);
      setPasswordSetToken(data.passwordSetToken);
      setStage("set-password");
    },
    onError: (err: any) => {
      setError(err.message || "We couldn't verify this link. It may have expired or already been used.");
      setStage("error");
    },
  });

  useEffect(() => {
    if (!token) return;
    verifyMutation.mutate();
    // mutate is stable and we only want this on initial mount with the token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPasswordMutation = useMutation({
    mutationFn: async () => {
      await postJson("/api/auth/reset-password", {
        token: passwordSetToken,
        newPassword: password,
      });
      await postJson("/api/auth/login", { email, password });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setStage("success");
      setTimeout(() => setLocation("/app/dashboard"), 800);
    },
    onError: (err: any) => {
      setError(err.message || "We couldn't set your password. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setPasswordMutation.mutate();
  };

  const firstName = displayName ? displayName.split(" ")[0] : null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div
        className="absolute inset-0 z-0 pointer-events-none bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroBg})` }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-t from-background/80 via-background/60 to-background/50" />

      <div className="mb-8 text-center relative z-10">
        <div className="flex items-center justify-center gap-3 mb-2">
          <img src="/images/brand/synozur-logo-color.png" alt="Synozur" className="h-7" />
          <span className="text-muted-foreground/50 font-light text-xl">|</span>
          <span className="font-bold text-2xl tracking-tight">Zenith</span>
        </div>
        <p className="text-muted-foreground text-sm">Microsoft 365 Governance Platform</p>
      </div>

      <Card className="w-full max-w-md glass-panel border-border/50 shadow-xl relative z-10 backdrop-blur-md" data-testid="card-verify-email">
        {stage === "verifying" && (
          <>
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl">Verifying your invitation</CardTitle>
              <CardDescription>Hang tight — we're confirming your link.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" data-testid="icon-verifying" />
            </CardContent>
          </>
        )}

        {stage === "set-password" && (
          <>
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl flex items-center justify-center gap-2">
                <MailCheck className="w-5 h-5 text-emerald-500" /> Email verified
              </CardTitle>
              <CardDescription>
                {firstName ? `Welcome, ${firstName}. ` : "Welcome. "}
                Set a password to finish activating your Zenith account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm" data-testid="text-verify-error">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={email} readOnly className="bg-muted/40" data-testid="input-verify-email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    data-testid="input-new-password"
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    required
                    minLength={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    data-testid="input-confirm-password"
                    type="password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <Button
                  data-testid="button-set-password"
                  type="submit"
                  className="w-full gap-2"
                  disabled={setPasswordMutation.isPending}
                >
                  {setPasswordMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                  Set Password & Sign In
                </Button>
              </form>
            </CardContent>
          </>
        )}

        {stage === "success" && (
          <>
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> You're all set
              </CardTitle>
              <CardDescription>Redirecting you to your dashboard…</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </CardContent>
          </>
        )}

        {stage === "error" && (
          <>
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl">Invitation link not valid</CardTitle>
              <CardDescription>This link may have expired or already been used.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm" data-testid="text-verify-error">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Ask the administrator who invited you to resend the invitation from
                <span className="font-medium"> Admin → Users → Resend invite</span>, then click the new link.
              </p>
            </CardContent>
            <CardFooter className="justify-center pb-6">
              <Button
                variant="outline"
                onClick={() => setLocation("/login")}
                data-testid="button-back-to-login"
              >
                Back to Sign In
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
