import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Shield, LogIn, UserPlus, AlertCircle, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import heroBg from "@assets/AdobeStock_382432785_1771938099802.jpeg";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const ssoStatus = useQuery({
    queryKey: ["/auth/entra/status"],
    queryFn: async () => {
      const res = await fetch("/auth/entra/status");
      return res.json();
    },
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/app/dashboard");
    },
    onError: (err: any) => {
      setError(err.message || "Login failed");
    },
  });

  const signupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/signup", { email, password, name });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Account created", description: "You can now sign in." });
      setMode("login");
      setError("");
    },
    onError: (err: any) => {
      setError(err.message || "Signup failed");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "login") {
      loginMutation.mutate();
    } else {
      signupMutation.mutate();
    }
  };

  const isLoading = loginMutation.isPending || signupMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div 
        className="absolute inset-0 z-0 pointer-events-none bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroBg})` }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-t from-background/80 via-background/60 to-background/50" />
      <div className="mb-8 text-center relative z-10">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <Shield className="w-6 h-6" />
          </div>
          <span className="font-bold text-2xl tracking-tight">Zenith</span>
        </div>
        <p className="text-muted-foreground text-sm">Microsoft 365 Governance Platform</p>
      </div>

      <Card className="w-full max-w-md glass-panel border-border/50 shadow-xl relative z-10 backdrop-blur-md" data-testid="card-login">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-xl">{mode === "login" ? "Sign In" : "Create Account"}</CardTitle>
          <CardDescription>
            {mode === "login"
              ? "Sign in with your credentials or Microsoft account"
              : "Create a new Zenith account"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ssoStatus.data?.configured && (
            <>
              <Button
                data-testid="button-sso-login"
                variant="outline"
                className="w-full gap-2 h-11"
                onClick={() => window.location.href = "/auth/entra/login"}
              >
                <svg viewBox="0 0 21 21" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
                Sign in with Microsoft
              </Button>
              <div className="relative">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  or
                </span>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm" data-testid="text-auth-error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  data-testid="input-name"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-testid="input-email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                data-testid="input-password"
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button
              data-testid="button-submit-auth"
              type="submit"
              className="w-full gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === "login" ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {mode === "login" ? "Sign In" : "Create Account"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center pb-6">
          <button
            data-testid="button-toggle-mode"
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
          >
            {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </CardFooter>
      </Card>
    </div>
  );
}
