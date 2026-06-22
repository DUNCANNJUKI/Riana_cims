import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lock, Mail, Eye, EyeOff, Building2, Phone } from "lucide-react";
import { API_URL, apiClient } from "@/integrations/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { resolveCompanyLogoUrl } from "@/utils/logoUrl";

export const LoginForm = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationHint, setVerificationHint] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetPhone, setResetPhone] = useState("");
  const { login, verifyTwoFactor, isLoading } = useAuth();
  const { toast } = useToast();
  const [logoPath, setLogoPath] = useState("/Riana_logo.png");

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch(`${API_URL}/public/company-branding`, { credentials: 'include' });
        const settings = response.ok ? await response.json() : null;
        if (settings?.logo_path) {
          setLogoPath(resolveCompanyLogoUrl(settings.logo_path, settings.updated_at || settings.id));
        }
      } catch (error) {
        // Not critical for login form
      }
    };
    loadSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    try {
      if (challengeId) {
        await verifyTwoFactor(challengeId, verificationCode);
      } else {
        const result = await login(email, password);
        if (result?.requiresTwoFactor) {
          setChallengeId(result.challengeId);
          setVerificationHint(`${String(result.method).toUpperCase()} code sent to ${result.destination}`);
          if (result.developmentCode) setVerificationCode(result.developmentCode);
          toast({ title: "Verification Required", description: "Enter the six-digit code to continue." });
          return;
        }
      }
      toast({
        title: "Success",
        description: "Logged in successfully",
      });
      // Force reload to update Index state and show the correct module
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Login failed",
        variant: "destructive",
      });
    }
  };


  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetEmail) {
      toast({
        title: "Error",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    try {
      await apiClient.post('/auth/forgot-password', {
        email: resetEmail,
        phoneNumber: resetPhone || undefined,
      });

      setShowForgotPassword(false);
      setResetEmail("");
      setResetPhone("");
      
      toast({
        title: "Password Reset Sent",
        description: "Check your email for password reset instructions",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send password reset",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/20 via-background to-secondary/20">
        <Card className="w-full max-w-md shadow-xl border-0 bg-card/95 backdrop-blur">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto flex justify-center py-6 h-28 w-full overflow-hidden items-center group">
              <img 
                src={logoPath} 
                alt="RIANA Group" 
                className="h-full w-auto object-contain drop-shadow-xl transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  if (e.currentTarget.src.includes(logoPath) && logoPath !== "/Riana_logo.png") {
                    setLogoPath("/Riana_logo.png");
                  }
                }}
              />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold gradient-text">RIANA CIMS</CardTitle>
              <CardDescription className="text-muted-foreground mt-2">
                Client Installation Management System
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@riana.co"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12"
                    required
                  />
                </div>
              </div>

              {challengeId && (
                <div className="space-y-2">
                  <Label htmlFor="verification-code">Verification Code</Label>
                  <Input
                    id="verification-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit code"
                    className="h-12 text-center tracking-[0.35em]"
                    required
                  />
                  <p className="text-xs text-muted-foreground">{verificationHint}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-12"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1 h-10 w-10 p-0"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 gradient-primary"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : challengeId ? "Verify & Sign In" : "Sign In"}
              </Button>
              
              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  className="text-sm text-muted-foreground hover:text-primary"
                  onClick={() => setShowForgotPassword(true)}
                >
                  Forgot your password?
                </Button>
              </div>
            </form>

            <div className="mt-6 text-center space-y-2">
              <div className="h-px bg-border"></div>
              <p className="text-xs text-muted-foreground">
                © {new Date().getFullYear()} RIANA Group. All rights reserved.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Your Password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetEmail">Email Address *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="resetEmail"
                  type="email"
                  placeholder="Enter your email address"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resetPhone">Phone Number (Optional)</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="resetPhone"
                  type="tel"
                  placeholder="Enter your phone number for SMS notification"
                  value={resetPhone}
                  onChange={(e) => setResetPhone(e.target.value)}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                If provided, you'll also receive password reset instructions via SMS
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowForgotPassword(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? "Sending..." : "Send Reset Instructions"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
