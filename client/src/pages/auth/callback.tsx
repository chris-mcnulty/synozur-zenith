import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function EntraCallbackPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Simulate Entra ID OAuth flow and token exchange
    const timer = setTimeout(() => {
      // In a real app, this would validate the state/nonce and exchange the code for a token.
      // We'll mock the routing logic here.
      // If user has 1 tenant -> /app/dashboard
      // If user has >1 tenant -> /app/select-tenant
      // For this MVP mockup, we'll go straight to a mock tenant selector to show the flow.
      setLocation("/app/select-tenant");
    }, 1500);

    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center cosmic-gradient">
      <div className="glass-panel p-10 rounded-2xl flex flex-col items-center text-center max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-500">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">Authenticating</h2>
        <p className="text-muted-foreground text-sm">
          Completing secure sign-in with Microsoft Entra ID...
        </p>
      </div>
    </div>
  );
}