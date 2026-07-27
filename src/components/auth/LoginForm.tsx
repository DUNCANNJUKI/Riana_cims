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
        viewBox="0 0 640 520"
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

        <ellipse cx="448" cy="118" rx="220" ry="170" fill="url(#networkClusterGlowTop)" />

        <g className="riana-login-card__network-polygons">
          <polygon points="90,70 190,32 283,82 236,182 128,166" />
          <polygon points="283,82 404,32 532,88 430,164 326,178" />
          <polygon points="236,182 326,178 388,278 264,302" />
          <polygon points="430,164 552,226 486,348 388,278" />
          <polygon points="486,348 584,292 620,398 542,466" />
        </g>

        <g className="riana-login-card__network-lines">
          <path d="M90 70 L190 32 L283 82 L404 32 L532 88 L626 54" />
          <path d="M90 70 L128 166 L236 182 L283 82 L326 178" />
          <path d="M128 166 L214 252 L264 302 L388 278 L430 164 L532 88" />
          <path d="M236 182 L326 178 L388 278 L486 348 L552 226 L626 158" />
          <path d="M404 32 L430 164 L552 226 L620 398" />
          <path d="M214 252 L332 382 L486 348 L542 466" />
          <path d="M326 178 L430 164 L552 226" />
        </g>

        <g className="riana-login-card__network-glows">
          <circle cx="404" cy="32" r="22" />
          <circle cx="552" cy="226" r="18" />
          <circle cx="542" cy="466" r="16" />
        </g>

        <g className="riana-login-card__network-rings">
          <circle cx="190" cy="32" r="9" />
          <circle cx="326" cy="178" r="10" />
          <circle cx="486" cy="348" r="9" />
          <circle cx="620" cy="398" r="8" />
        </g>

        <g className="riana-login-card__network-nodes">
          <circle cx="90" cy="70" r="6" />
          <circle cx="283" cy="82" r="7" />
          <circle cx="404" cy="32" r="8" />
          <circle cx="532" cy="88" r="7" />
          <circle cx="626" cy="54" r="4.5" />
          <circle cx="128" cy="166" r="7" />
          <circle cx="236" cy="182" r="6" />
          <circle cx="430" cy="164" r="7" />
          <circle cx="552" cy="226" r="8" />
          <circle cx="626" cy="158" r="5" />
          <circle cx="214" cy="252" r="5.5" />
          <circle cx="264" cy="302" r="6" />
          <circle cx="388" cy="278" r="7" />
          <circle cx="332" cy="382" r="5" />
          <circle cx="542" cy="466" r="7" />
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

        <ellipse cx="154" cy="282" rx="194" ry="138" fill="url(#networkClusterGlowBottom)" />

        <g className="riana-login-card__network-polygons">
          <polygon points="18,366 104,286 188,342 112,414" />
          <polygon points="104,286 64,198 166,146 286,246 188,342" />
          <polygon points="166,146 252,88 360,158 286,246" />
          <polygon points="286,246 360,158 456,108 496,222 380,310" />
        </g>

        <g className="riana-login-card__network-lines">
          <path d="M18 366 L104 286 L188 342 L286 246 L380 310 L496 222" />
          <path d="M18 366 L112 414 L188 342 L246 410" />
          <path d="M104 286 L64 198 L166 146 L286 246" />
          <path d="M166 146 L252 88 L360 158 L286 246" />
          <path d="M360 158 L456 108 L496 222 L380 310" />
          <path d="M188 342 L286 246 L380 310" />
          <path d="M64 198 L252 88 L456 108" />
        </g>

        <g className="riana-login-card__network-glows">
          <circle cx="104" cy="286" r="18" />
          <circle cx="286" cy="246" r="16" />
          <circle cx="456" cy="108" r="14" />
        </g>

        <g className="riana-login-card__network-rings">
          <circle cx="18" cy="366" r="8" />
          <circle cx="166" cy="146" r="9" />
          <circle cx="360" cy="158" r="9" />
          <circle cx="496" cy="222" r="8" />
        </g>

        <g className="riana-login-card__network-nodes">
          <circle cx="104" cy="286" r="8" />
          <circle cx="188" cy="342" r="7" />
          <circle cx="286" cy="246" r="8" />
          <circle cx="380" cy="310" r="7" />
          <circle cx="112" cy="414" r="6" />
          <circle cx="246" cy="410" r="7" />
          <circle cx="64" cy="198" r="6" />
          <circle cx="252" cy="88" r="6" />
          <circle cx="456" cy="108" r="6" />
        </g>
      </svg>
    </div>
  );
}