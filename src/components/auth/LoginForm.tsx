import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lock, Mail, Eye, EyeOff, Phone } from "lucide-react";
import { apiClient } from "@/integrations/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import "./LoginForm.css";

const LOGIN_LOGO_PATH = "/Riana_logo_transparent.png";

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

  return (
    <>
      <div className="riana-login-page">
        <section className="riana-login-card">
          <NetworkDecoration />

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
              <h1 className="riana-login-card__title">RIANA CIMS</h1>
              <p className="riana-login-card__subtitle">
                Client Installation Management System
              </p>
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
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit code"
                    className="riana-login-card__input riana-login-card__input--verification"
                    required
                  />
                  <p className="riana-login-card__hint">{verificationHint}</p>
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

              <button
                type="submit"
                className="riana-login-card__submit"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : challengeId ? "Verify & Sign In" : "Sign In"}
              </button>
              
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
              <div className="riana-login-card__divider"></div>
              <p>
                &copy; {new Date().getFullYear()} RIANA Group. All rights reserved.
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

function NetworkDecoration() {
  return (
    <div className="riana-login-card__decoration" aria-hidden="true">
      <svg
        className="riana-login-card__network riana-login-card__network--top"
        viewBox="0 0 180 180"
        role="presentation"
      >
        <defs>
          <linearGradient
            id="networkLineGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#45c9df" stopOpacity="0.24" />
            <stop offset="48%" stopColor="#1599b8" stopOpacity="0.56" />
            <stop offset="100%" stopColor="#37d5e7" stopOpacity="0.2" />
          </linearGradient>
          <radialGradient id="networkClusterGlowTop" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#32d6e9" stopOpacity="0.28" />
            <stop offset="72%" stopColor="#1aa9c7" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#1aa9c7" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="126" cy="36" rx="94" ry="70" fill="url(#networkClusterGlowTop)" />

        <g className="riana-login-card__network-polygons">
          <polygon points="42,0 76,0 128,22 60,54" />
          <polygon points="60,54 128,22 180,76 154,92 103,114" />
          <polygon points="42,0 60,54 48,102" />
          <polygon points="48,102 60,54 103,114 92,148" />
          <polygon points="103,114 154,92 180,76 154,176" />
        </g>

        <g className="riana-login-card__network-lines">
          <path d="M42 0 L76 0 L128 22 L178 2" />
          <path d="M42 0 L60 54 L128 22 L180 76" />
          <path d="M48 102 L60 54 L103 114 L92 148" />
          <path d="M60 54 L103 114 L154 92 L180 76" />
          <path d="M76 0 L60 54 L103 114 L128 22" />
          <path d="M128 22 L154 92 L154 176" />
          <path d="M103 114 L154 176" />
          <path d="M180 28 L128 22 L180 76" />
          <path d="M48 102 L103 114 L154 92" />
          <path d="M76 0 L180 28 L178 2" />
        </g>

        <g className="riana-login-card__network-glows">
          <circle cx="128" cy="22" r="20" />
          <circle cx="154" cy="176" r="12" />
        </g>

        <g className="riana-login-card__network-stars">
          <line x1="106" y1="22" x2="150" y2="22" />
          <line x1="128" y1="0" x2="128" y2="44" />
          <line x1="113" y1="7" x2="143" y2="37" />
          <line x1="143" y1="7" x2="113" y2="37" />
          <circle cx="128" cy="22" r="3" />
          <line x1="145" y1="176" x2="163" y2="176" />
          <line x1="154" y1="167" x2="154" y2="180" />
          <circle cx="154" cy="176" r="1.9" />
        </g>

        <g className="riana-login-card__network-rings">
          <circle cx="128" cy="22" r="6" />
          <circle cx="103" cy="114" r="5" />
        </g>

        <g className="riana-login-card__network-nodes">
          <circle cx="42" cy="0" r="2.6" />
          <circle cx="76" cy="0" r="2.2" />
          <circle cx="128" cy="22" r="3.2" />
          <circle cx="178" cy="2" r="2.3" />
          <circle cx="180" cy="28" r="2.1" />
          <circle cx="180" cy="76" r="2.7" />
          <circle cx="154" cy="92" r="2.5" />
          <circle cx="103" cy="114" r="3.2" />
          <circle cx="60" cy="54" r="2.7" />
          <circle cx="48" cy="102" r="3" />
          <circle cx="92" cy="148" r="3" />
          <circle cx="154" cy="176" r="2.5" />
        </g>
      </svg>

      <svg
        className="riana-login-card__network riana-login-card__network--bottom"
        viewBox="0 0 520 430"
        role="presentation"
      >
        <defs>
          <linearGradient
            id="networkLineGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#45c9df" stopOpacity="0.24" />
            <stop offset="48%" stopColor="#1599b8" stopOpacity="0.56" />
            <stop offset="100%" stopColor="#37d5e7" stopOpacity="0.2" />
          </linearGradient>
          <radialGradient id="networkClusterGlowBottom" cx="45%" cy="55%" r="50%">
            <stop offset="0%" stopColor="#2acfe3" stopOpacity="0.22" />
            <stop offset="70%" stopColor="#1297b8" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#1297b8" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="150" cy="284" rx="202" ry="142" fill="url(#networkClusterGlowBottom)" />

        <g className="riana-login-card__network-polygons">
          <polygon points="20,348 96,292 60,214 148,154 280,238 178,342" />
          <polygon points="148,154 252,92 366,154 280,238" />
          <polygon points="280,238 366,154 466,96 504,226 388,306" />
        </g>

        <g className="riana-login-card__network-lines">
          <path d="M20 348 L96 292 L178 342 L280 238 L388 306 L504 226" />
          <path d="M96 292 L60 214 L148 154 L280 238" />
          <path d="M148 154 L252 92 L366 154 L280 238" />
          <path d="M366 154 L466 96 L504 226 L388 306" />
          <path d="M20 348 L118 404 L178 342 L246 410" />
          <path d="M60 214 L252 92 L466 96" />
        </g>

        <g className="riana-login-card__network-glows">
          <circle cx="96" cy="292" r="24" />
          <circle cx="466" cy="96" r="18" />
        </g>

        <g className="riana-login-card__network-stars">
          <line x1="76" y1="292" x2="116" y2="292" />
          <line x1="96" y1="272" x2="96" y2="312" />
          <circle cx="96" cy="292" r="3" />
        </g>

        <g className="riana-login-card__network-rings">
          <circle cx="96" cy="292" r="7" />
          <circle cx="280" cy="238" r="7" />
          <circle cx="466" cy="96" r="6" />
        </g>

        <g className="riana-login-card__network-nodes">
          <circle cx="20" cy="348" r="4.5" />
          <circle cx="96" cy="292" r="5" />
          <circle cx="178" cy="342" r="4.5" />
          <circle cx="280" cy="238" r="5" />
          <circle cx="388" cy="306" r="4.5" />
          <circle cx="504" cy="226" r="4" />
          <circle cx="60" cy="214" r="4" />
          <circle cx="148" cy="154" r="4.5" />
          <circle cx="252" cy="92" r="4" />
          <circle cx="366" cy="154" r="4.5" />
          <circle cx="466" cy="96" r="4" />
          <circle cx="118" cy="404" r="3.5" />
          <circle cx="246" cy="410" r="3.5" />
        </g>
      </svg>
    </div>
  );
}
