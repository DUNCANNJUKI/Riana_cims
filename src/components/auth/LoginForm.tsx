import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock, Mail, Eye, EyeOff, Phone, Fingerprint } from "lucide-react";
import { apiClient } from "@/integrations/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { AuthNetworkBackground } from "./AuthNetworkBackground";
import "./LoginForm.css";

const LOGIN_LOGO_PATH = "/Riana_mark_color_trimmed.png";

export const LoginForm = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationHint, setVerificationHint] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetPhone, setResetPhone] = useState("");
  const { login, loginWithPasskey, verifyTwoFactor, isLoading } = useAuth();
  const { toast } = useToast();
  const [logoPath, setLogoPath] = useState(LOGIN_LOGO_PATH);

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
        await verifyTwoFactor(challengeId, verificationCode, verificationMethod, useRecoveryCode);
      } else {
        const result = await login(email, password);
        if (result?.requiresTwoFactor) {
          setChallengeId(result.challengeId);
          setVerificationMethod(String(result.method || ""));
          setVerificationHint(result.method === "totp" ? "Enter the current code from your authenticator app." : `${String(result.method).toUpperCase()} code sent to ${result.destination}`);
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
        description: "Check your email and SMS for the password reset link.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send password reset",
        variant: "destructive",
      });
    }
  };

  const handlePasskeyLogin = async () => {
    if (!email) {
      toast({ title: "Email required", description: "Enter your account email before using a passkey.", variant: "destructive" });
      return;
    }
    if (!("PublicKeyCredential" in window) || !navigator.credentials) {
      toast({ title: "Passkeys unsupported", description: "This browser cannot use passkeys. Sign in with your password or use a supported browser.", variant: "destructive" });
      return;
    }
    try {
      const result = await loginWithPasskey(email);
      if (result?.requiresTwoFactor) {
        setChallengeId(result.challengeId);
        setVerificationMethod(String(result.method || ""));
        setVerificationHint(result.method === "totp" ? "Enter the current code from your authenticator app." : `${String(result.method).toUpperCase()} code sent to ${result.destination}`);
        if (result.developmentCode) setVerificationCode(result.developmentCode);
        toast({ title: "Verification Required", description: "Complete your mandatory two-factor verification." });
        return;
      }
      toast({ title: "Success", description: "Signed in securely with your passkey." });
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      const cancelled = error instanceof DOMException && ["AbortError", "NotAllowedError"].includes(error.name);
      toast({
        title: cancelled ? "Passkey sign-in cancelled" : "Passkey sign-in failed",
        description: cancelled ? "No changes were made. Try again when you are ready." : error instanceof Error ? error.message : "Unable to use this passkey.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="riana-login-page auth-network-surface">
        <AuthNetworkBackground />
        <section className="riana-login-card">

          <div className="riana-login-card__content">
            <header className="riana-login-card__header">
              <div className="riana-login-card__logo-wrap">
                <img
                  src={logoPath}
                  alt="RIANA Group"
                  className="riana-login-card__logo"
                  onError={(e) => {
                    if (e.currentTarget.src.includes(logoPath) && logoPath !== LOGIN_LOGO_PATH) {
                      setLogoPath(LOGIN_LOGO_PATH);
                    }
                  }}
                />
              </div>
              <div className="riana-login-card__brand-text">
                <h1 className="riana-login-card__title">
                  <span className="riana-login-card__name">RIANA</span>{" "}
                  <span className="riana-login-card__system">CIMS</span>
                </h1>
                <p className="riana-login-card__subtitle">
                  Client Installation Management System
                </p>
              </div>
            </header>

            <form onSubmit={handleSubmit} className="riana-login-card__form">
              <div className="riana-login-card__field-group">
                <Label htmlFor="email" className="riana-login-card__label">
                  Email Address
                </Label>
                <div className="riana-login-card__input-wrapper">
                  <Mail className="riana-login-card__input-icon" aria-hidden="true" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@riana.co"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="riana-login-card__input"
                    required
                  />
                </div>
              </div>

              {challengeId && (
                <div className="riana-login-card__field-group">
                  <Label htmlFor="verification-code" className="riana-login-card__label">
                    Verification Code
                  </Label>
                  <Input
                    id="verification-code"
                    inputMode={useRecoveryCode ? "text" : "numeric"}
                    autoComplete="one-time-code"
                    maxLength={useRecoveryCode ? 17 : 6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(useRecoveryCode ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') : e.target.value.replace(/\D/g, ''))}
                    placeholder={useRecoveryCode ? "XXXXX-XXXXX-XXXXX" : "Enter 6-digit code"}
                    className="riana-login-card__input riana-login-card__input--verification"
                    required
                  />
                  <p className="riana-login-card__hint">{verificationHint}</p>
                  {verificationMethod === "totp" && (
                    <Button type="button" variant="link" className="h-auto justify-start p-0 text-xs" onClick={() => { setUseRecoveryCode(value => !value); setVerificationCode(""); }}>
                      {useRecoveryCode ? "Use authenticator code" : "Use a recovery code"}
                    </Button>
                  )}
                </div>
              )}

              <div className="riana-login-card__field-group">
                <Label htmlFor="password" className="riana-login-card__label">
                  Password
                </Label>
                <div className="riana-login-card__input-wrapper">
                  <Lock className="riana-login-card__input-icon" aria-hidden="true" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="riana-login-card__input riana-login-card__input--password"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="riana-login-card__password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="riana-login-card__actions">
                <button
                  type="submit"
                  className="riana-login-card__submit"
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : challengeId ? "Verify & Sign In" : "Sign In"}
                </button>

                {!challengeId && (
                  <TooltipProvider delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="riana-login-card__passkey"
                          disabled={isLoading}
                          onClick={handlePasskeyLogin}
                          aria-label="Sign in with passkey"
                        >
                          {isLoading ? <span className="riana-login-card__passkey-spinner" aria-hidden="true" /> : <Fingerprint aria-hidden="true" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Sign in with passkey</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              
              <div className="text-center">
                <button
                  type="button"
                  className="riana-login-card__forgot-password"
                  onClick={() => setShowForgotPassword(true)}
                >
                  Forgot your password?
                </button>
              </div>
            </form>

            <footer className="riana-login-card__footer">
              <p>
                &copy; 2026 RIANA Group. All rights reserved.
              </p>
            </footer>
          </div>
        </section>
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
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="resetPhone"
                  type="tel"
                  placeholder="Enter phone number"
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
