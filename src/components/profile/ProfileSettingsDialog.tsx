import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bell, Camera, CheckCircle, ChevronRight, Eye, EyeOff, Fingerprint, KeyRound, Laptop, Lock, Loader2, LogOut, Mail, Phone, ShieldCheck, Trash2, User } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/apiClient";
import { User as UserType } from "@/types";
import { CountryPhoneInput } from "@/components/common/CountryPhoneInput";
import { formatRoleLabel } from "@/utils/roleLabel";
import { resolveAvatarUrl } from "@/utils/avatar";
import { resolveTimeZone, TIME_ZONE_PREFERENCE_CHANGED_EVENT } from "@/utils/dateTime";
import { requestAppLock } from "@/utils/appLock";
import { cn } from "@/lib/utils";

interface ProfileSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType;
  onProfileUpdate?: () => void | Promise<void>;
  view?: "profile" | "settings";
}

type PasskeyRecord = { id: string; display_name: string; device_type?: string; backed_up?: boolean; created_at: string; last_used_at?: string | null };
type SessionRecord = { id: string; device_name?: string; browser_name?: string; ip_address?: string; created_at: string; last_activity_at: string; revoked_at?: string | null; current: boolean };
type CommunicationPreferences = { keep_history: boolean; notifications_enabled: boolean; message_notifications: boolean; call_notifications: boolean; do_not_disturb: boolean; quiet_hours_enabled: boolean; quiet_hours_start: string; quiet_hours_end: string; timezone: string; language: "en"; theme: "light" | "dark" | "system"; inactivity_timeout_minutes: number; lock_on_resume: boolean };
const DEFAULT_COMMUNICATION_PREFERENCES: CommunicationPreferences = { keep_history: false, notifications_enabled: true, message_notifications: true, call_notifications: true, do_not_disturb: false, quiet_hours_enabled: false, quiet_hours_start: "22:00", quiet_hours_end: "07:00", timezone: "Africa/Nairobi", language: "en", theme: "system", inactivity_timeout_minutes: 10, lock_on_resume: false };

export const ProfileSettingsDialog = ({ isOpen, onClose, user, onProfileUpdate, view = "settings" }: ProfileSettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState("profile");
  const [activeSecuritySection, setActiveSecuritySection] = useState<"password" | "mfa" | "passkeys" | "sessions">("mfa");
  const [isUploading, setIsUploading] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(() => resolveAvatarUrl(user.avatar_url));
  const [firstName, setFirstName] = useState(user.first_name || "");
  const [lastName, setLastName] = useState(user.last_name || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState(user.phone_number || "");
  const [identityPassword, setIdentityPassword] = useState("");
  const [identityCode, setIdentityCode] = useState("");
  const [identityRequest, setIdentityRequest] = useState<{ requestId: string; type: "email" | "phone" } | null>(null);
  const [identityRequestDestination, setIdentityRequestDestination] = useState("");
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<"email" | "sms" | "call" | "totp">("email");
  const [twoFactorPhone, setTwoFactorPhone] = useState(user.phone_number || "");
  const [isSavingTwoFactor, setIsSavingTwoFactor] = useState(false);
  const [twoFactorChallengeId, setTwoFactorChallengeId] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorHint, setTwoFactorHint] = useState("");
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [totpEnrollment, setTotpEnrollment] = useState<{ enrollmentId: string; secret: string; qrCodeDataUrl: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryCodesRemaining, setRecoveryCodesRemaining] = useState(0);
  const [totpActive, setTotpActive] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [passkeyName, setPasskeyName] = useState("My device");
  const [securityPassword, setSecurityPassword] = useState("");
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [communicationPreferences, setCommunicationPreferences] = useState(DEFAULT_COMMUNICATION_PREFERENCES);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) setActiveTab(view === "profile" ? "profile" : "preferences");
  }, [isOpen, view]);

  useEffect(() => {
    if (!isOpen) return;
    setAvatarUrl(resolveAvatarUrl(user.avatar_url));
    setFirstName(user.first_name || "");
    setLastName(user.last_name || "");
    setNewPhone(user.phone_number || "");
    apiClient.get("/auth/2fa-settings").then((settings) => {
      setTwoFactorEnabled(Boolean(settings.two_factor_enabled));
      setTwoFactorMethod(settings.two_factor_method || "email");
      setTwoFactorPhone(settings.two_factor_phone || settings.phone_number || "");
      setRecoveryCodesRemaining(Number(settings.recovery_codes_remaining || 0));
      setTotpActive(Boolean(settings.two_factor_enabled && settings.two_factor_method === "totp"));
    }).catch(() => undefined);
    void Promise.all([
      apiClient.get("/auth/passkeys").then(setPasskeys),
      apiClient.get("/auth/sessions").then(setSessions),
      apiClient.get("/communication/preferences").then((preferences) => setCommunicationPreferences({ ...DEFAULT_COMMUNICATION_PREFERENCES, ...preferences })),
      apiClient.get("/auth/profile/identity-change").then((pending) => {
        if (pending.pending) { setIdentityRequest({ requestId: pending.requestId, type: pending.type }); setIdentityRequestDestination(pending.destination || ""); }
        else { setIdentityRequest(null); setIdentityRequestDestination(""); }
      }),
    ]).catch(() => undefined);
  }, [isOpen, user.avatar_url, user.first_name, user.last_name, user.phone_number]);

  const getUserInitials = () => {
    if (user.first_name && user.last_name) return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    return user.email.charAt(0).toUpperCase();
  };

  const getUserFullName = () => {
    if (user.first_name || user.last_name) return `${user.first_name || ""} ${user.last_name || ""}`.trim();
    return user.email;
  };

  const readFileAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Failed to read the selected file."));
    reader.readAsDataURL(file);
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      toast({ title: "Invalid profile picture", description: "Use a JPG, PNG, or WebP image.", variant: "destructive" });
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Profile picture is too large", description: "Upload an image smaller than 5 MB.", variant: "destructive" });
      event.target.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const previewUrl = URL.createObjectURL(file);
      setAvatarUrl(previewUrl);
      const base64Data = await readFileAsBase64(file);
      const uploadResponse = await apiClient.post("/auth/avatar", { fileName: file.name, base64Data });
      const persistedUrl = resolveAvatarUrl(uploadResponse.avatar_url);
      setAvatarUrl(persistedUrl);
      URL.revokeObjectURL(previewUrl);
      await onProfileUpdate?.();
      toast({ title: "Profile picture updated", description: "Your new photo will appear in your profile and header." });
    } catch (error) {
      setAvatarUrl(resolveAvatarUrl(user.avatar_url));
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Failed to upload profile picture.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const saveProfileName = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      toast({ title: "Name required", description: "Enter a first or last name.", variant: "destructive" });
      return;
    }
    setIsSavingProfile(true);
    try {
      const saved = await apiClient.patch("/auth/profile", { first_name: firstName, last_name: lastName });
      setFirstName(saved.first_name || "");
      setLastName(saved.last_name || "");
      await onProfileUpdate?.();
      toast({ title: "Profile name updated" });
    } catch (error) {
      toast({ title: "Unable to update profile", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally { setIsSavingProfile(false); }
  };

  const requestIdentityChange = async (type: "email" | "phone") => {
    const value = type === "email" ? newEmail : newPhone;
    if (!value.trim() || !identityPassword) {
      toast({ title: "Verification details required", description: "Enter the new value and your current password.", variant: "destructive" });
      return;
    }
    setIsSavingIdentity(true);
    try {
      const result = await apiClient.post("/auth/profile/identity-change", { type, value, currentPassword: identityPassword });
      setIdentityRequest({ requestId: result.requestId, type });
      setIdentityRequestDestination(type === "email" ? newEmail : newPhone);
      setIdentityCode(result.developmentCode || "");
      toast({ title: "Verification code sent", description: `Confirm the code delivered to the new ${type}.` });
    } catch (error) { toast({ title: "Unable to start verification", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); }
    finally { setIsSavingIdentity(false); }
  };

  const confirmIdentityChange = async () => {
    if (!identityRequest || identityCode.length !== 6) return;
    setIsSavingIdentity(true);
    try {
      const result = await apiClient.post("/auth/profile/identity-change/confirm", { requestId: identityRequest.requestId, code: identityCode });
      setIdentityRequest(null);
      setIdentityRequestDestination("");
      setIdentityCode("");
      setIdentityPassword("");
      if (result.requiresReauthentication) {
        localStorage.removeItem("riana-auth-token");
        localStorage.removeItem("riana_user");
        sessionStorage.setItem("riana-auth-message", "Your verified email was updated. Sign in again with the new address.");
        window.location.assign("/");
        return;
      }
      await onProfileUpdate?.();
      toast({ title: "Verified phone updated" });
    } catch (error) { toast({ title: "Verification failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); }
    finally { setIsSavingIdentity(false); }
  };

  const handleSaveTwoFactor = async () => {
    if (twoFactorMethod === "totp") {
      if (!twoFactorPassword) {
        toast({ title: "Current password required", description: "Verify your password before changing authenticator settings.", variant: "destructive" });
        return;
      }
      setIsSavingTwoFactor(true);
      try {
        if (!twoFactorEnabled) {
          await apiClient.delete("/auth/totp", { currentPassword: twoFactorPassword, code: twoFactorCode });
          setTotpEnrollment(null);
          setRecoveryCodes([]);
          setRecoveryCodesRemaining(0);
          setTotpActive(false);
          setTwoFactorMethod("email");
          setTwoFactorCode("");
          setTwoFactorPassword("");
          toast({ title: "Authenticator MFA disabled", description: "Unused recovery codes were revoked." });
          return;
        }
        if (totpActive && !totpEnrollment) {
          const result = await apiClient.post("/auth/recovery-codes/regenerate", { currentPassword: twoFactorPassword, code: twoFactorCode });
          setRecoveryCodes(result.recoveryCodes || []);
          setRecoveryCodesRemaining((result.recoveryCodes || []).length);
          setTwoFactorCode("");
          setTwoFactorPassword("");
          toast({ title: "Recovery codes regenerated", description: "All older unused codes are now invalid." });
          return;
        }
        if (!totpEnrollment) {
          const enrollment = await apiClient.post("/auth/totp/enroll", { currentPassword: twoFactorPassword });
          setTotpEnrollment(enrollment);
          setTwoFactorCode("");
          toast({ title: "Scan the QR code", description: "Confirm with the current six-digit code before this method becomes active." });
          return;
        }
        const result = await apiClient.post("/auth/totp/confirm", { enrollmentId: totpEnrollment.enrollmentId, code: twoFactorCode });
        setRecoveryCodes(result.recoveryCodes || []);
        setRecoveryCodesRemaining((result.recoveryCodes || []).length);
        setTotpActive(true);
        setTotpEnrollment(null);
        setTwoFactorCode("");
        setTwoFactorPassword("");
        toast({ title: "Authenticator MFA enabled", description: "Save the recovery codes now; they will not be shown again." });
      } catch (error) {
        toast({ title: "Unable to update authenticator MFA", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
      } finally { setIsSavingTwoFactor(false); }
      return;
    }
    if (twoFactorEnabled && twoFactorMethod !== "email" && !twoFactorPhone.trim()) {
      toast({ title: "Verification phone required", description: "Add a phone number for SMS or voice-call verification.", variant: "destructive" });
      return;
    }

    setIsSavingTwoFactor(true);
    try {
      const settings = await apiClient.patch("/auth/2fa-settings", {
        enabled: twoFactorEnabled,
        method: twoFactorMethod,
        phone: twoFactorMethod === "email" ? null : twoFactorPhone,
        challengeId: twoFactorChallengeId || undefined,
        code: twoFactorCode || undefined,
        currentPassword: twoFactorPassword,
      });
      if (settings.requiresConfirmation) {
        setTwoFactorChallengeId(settings.challengeId);
        setTwoFactorHint(`${String(settings.method).toUpperCase()} code sent to ${settings.destination}`);
        if (settings.developmentCode) setTwoFactorCode(settings.developmentCode);
        toast({ title: "Confirm two-factor authentication", description: "Enter the delivered code to complete enrollment." });
        return;
      }
      setTwoFactorEnabled(Boolean(settings.enabled));
      setTwoFactorMethod(settings.method || "email");
      setTwoFactorPhone(settings.phone || "");
      setTwoFactorChallengeId("");
      setTwoFactorCode("");
      setTwoFactorHint("");
      setTwoFactorPassword("");
      await onProfileUpdate?.();
      toast({ title: "Two-factor authentication updated", description: settings.enabled ? `Login codes will use ${settings.method}.` : "Two-factor authentication is disabled." });
    } catch (error) {
      toast({ title: "Unable to update 2FA", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setIsSavingTwoFactor(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword) {
      toast({ title: "Current password required", description: "Enter your current password before saving.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password is too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", description: "Confirm the same new password.", variant: "destructive" });
      return;
    }

    setIsChangingPassword(true);
    try {
      const verifyResponse = await apiClient.post("/auth/verify-password", { email: user.email, password: oldPassword });
      if (!verifyResponse.success) {
        toast({ title: "Incorrect password", description: "The current password you entered is incorrect.", variant: "destructive" });
        return;
      }

      await apiClient.patch("/auth/password", { currentPassword: oldPassword, password: newPassword });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password changed", description: "Your password was updated. Please sign in again." });
      setTimeout(() => {
        localStorage.removeItem("riana-auth-token");
        localStorage.removeItem("riana_auth_token");
        window.location.href = "/";
      }, 1500);
    } catch (error) {
      toast({ title: "Password update failed", description: error instanceof Error ? error.message : "Failed to change password.", variant: "destructive" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const registerPasskey = async () => {
    if (!securityPassword) {
      toast({ title: "Recent verification required", description: "Enter your current password before registering a passkey.", variant: "destructive" });
      return;
    }
    setIsRegisteringPasskey(true);
    try {
      const challenge = await apiClient.post("/auth/passkeys/register-options", { password: securityPassword });
      const response = await startRegistration({ optionsJSON: challenge.options });
      await apiClient.post("/auth/passkeys/register-verify", { challengeId: challenge.challengeId, response, name: passkeyName });
      setPasskeys(await apiClient.get("/auth/passkeys"));
      setSecurityPassword("");
      toast({ title: "Passkey added", description: "This passkey can now be used for secure sign-in." });
    } catch (error) {
      toast({ title: "Passkey registration failed", description: error instanceof Error ? error.message : "Unable to register this passkey.", variant: "destructive" });
    } finally { setIsRegisteringPasskey(false); }
  };

  const removePasskey = async (id: string) => {
    if (!securityPassword) {
      toast({ title: "Recent verification required", description: "Enter your current password before removing a passkey.", variant: "destructive" });
      return;
    }
    try {
      await apiClient.delete(`/auth/passkeys/${encodeURIComponent(id)}`, { password: securityPassword });
      setPasskeys((items) => items.filter((item) => item.id !== id));
      setSecurityPassword("");
      toast({ title: "Passkey removed" });
    } catch (error) {
      toast({ title: "Unable to remove passkey", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const revokeSession = async (session: SessionRecord) => {
    try {
      const result = await apiClient.delete(`/auth/sessions/${encodeURIComponent(session.id)}`);
      if (result.current) {
        localStorage.removeItem("riana-auth-token");
        localStorage.removeItem("riana_user");
        window.location.assign("/");
        return;
      }
      setSessions((items) => items.map((item) => item.id === session.id ? { ...item, revoked_at: new Date().toISOString() } : item));
      toast({ title: "Session revoked" });
    } catch (error) {
      toast({ title: "Unable to revoke session", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const lockApplication = async () => {
    requestAppLock("manual");
    onClose();
  };

  const saveCommunicationPreferences = async () => {
    setIsSavingPreferences(true);
    try {
      const saved = await apiClient.put("/communication/preferences", communicationPreferences);
      setCommunicationPreferences((current) => ({ ...current, ...saved }));
      const timeZone = resolveTimeZone(communicationPreferences.timezone);
      setCommunicationPreferences((current) => ({ ...current, timezone: timeZone }));
      window.dispatchEvent(new CustomEvent(TIME_ZONE_PREFERENCE_CHANGED_EVENT, { detail: { timeZone } }));
      const theme = saved.theme || communicationPreferences.theme;
      localStorage.setItem("theme", theme);
      const useDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", useDark);
      window.dispatchEvent(new CustomEvent("riana-theme-preference-changed", { detail: { theme } }));
      window.dispatchEvent(new CustomEvent("riana-lock-preferences-changed", { detail: { inactivityTimeoutMinutes: saved.inactivity_timeout_minutes, lockOnResume: saved.lock_on_resume } }));
      toast({ title: "Preferences saved", description: "Notification and communication settings were updated." });
    } catch (error) {
      toast({ title: "Unable to save preferences", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally { setIsSavingPreferences(false); }
  };

  const methodLabel = twoFactorMethod === "email" ? "Email code" : twoFactorMethod === "sms" ? "SMS code" : twoFactorMethod === "call" ? "Voice call" : "Authenticator app";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/30 px-5 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <User className="h-5 w-5 text-primary" />
            {view === "profile" ? "My Profile" : "Account Settings"}
          </DialogTitle>
          <DialogDescription>{view === "profile" ? "Manage your photo, display name, and verified contact details." : "Manage sign-in security, account protection, and preferences."}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-4 pb-5 sm:px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {view === "settings" && <TabsList className="sticky top-0 z-10 mt-4 grid h-auto w-full grid-cols-3 gap-1 rounded-lg bg-muted/95 p-1 backdrop-blur">
              <TabsTrigger value="profile" className="gap-2 rounded-md">
                <Camera className="h-4 w-4" />
                <span className="max-sm:hidden">My Profile</span><span className="sm:hidden">Profile</span>
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2 rounded-md">
                <ShieldCheck className="h-4 w-4" />
                <span className="max-sm:hidden">Security &amp; Sign-in</span><span className="sm:hidden">Security</span>
              </TabsTrigger>
              <TabsTrigger value="preferences" className="gap-2 rounded-md"><Bell className="h-4 w-4" /><span className="max-sm:hidden">Preferences</span><span className="sr-only sm:hidden">Preferences</span></TabsTrigger>
            </TabsList>}

            <TabsContent value="profile" className="mt-5 space-y-4">
              <Card className="overflow-hidden border-primary/10 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="relative w-fit">
                      <Avatar className="h-28 w-28 border-4 border-background shadow-lg ring-2 ring-primary/30">
                        <AvatarImage src={avatarUrl} alt={getUserFullName()} />
                        <AvatarFallback className="bg-primary text-2xl font-bold text-primary-foreground">{getUserInitials()}</AvatarFallback>
                      </Avatar>
                      {view === "settings" && <Button
                        type="button"
                        size="icon"
                        className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full shadow-md"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        aria-label="Change profile picture"
                      >
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      </Button>}
                      {view === "settings" && <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelect} />}
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <h3 className="truncate text-xl font-semibold text-foreground">{getUserFullName()}</h3>
                        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{formatRoleLabel(user.role)}</Badge>
                        {user.designation && <Badge variant="outline">{user.designation}</Badge>}
                        <Badge variant={twoFactorEnabled ? "default" : "outline"}>{twoFactorEnabled ? "2FA enabled" : "2FA off"}</Badge>
                      </div>
                      {view === "settings" && <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                        {isUploading ? "Uploading..." : "Change Profile Picture"}
                      </Button>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-card p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Mail className="h-4 w-4 text-primary" /> Email</div>
                  <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Phone className="h-4 w-4 text-primary" /> Phone</div>
                  <p className="truncate text-sm text-muted-foreground">{user.phone_number || "Not set"}</p>
                </div>
              </div>
              {view === "settings" && <Card className="border-primary/10 shadow-sm">
                <CardHeader><CardTitle className="text-lg">Display name</CardTitle><CardDescription>Update the permitted name shown across CIMS. Roles, permissions, and subsidiary assignments are unchanged.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="profile-first-name">First name</Label><Input id="profile-first-name" value={firstName} maxLength={100} onChange={(event) => setFirstName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-last-name">Last name</Label><Input id="profile-last-name" value={lastName} maxLength={100} onChange={(event) => setLastName(event.target.value)} /></div></div>
                  <Button type="button" onClick={saveProfileName} disabled={isSavingProfile || (!firstName.trim() && !lastName.trim())}>{isSavingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <User className="mr-2 h-4 w-4" />}Save display name</Button>
                </CardContent>
              </Card>}
              {view === "settings" && <Card className="border-primary/10 shadow-sm">
                <CardHeader><CardTitle className="text-lg">Verified contact details</CardTitle><CardDescription>Changes require your current password and a single-use code delivered to the new destination.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="profile-new-email">New work email</Label><Input id="profile-new-email" type="email" placeholder="name@riana.co" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /><Button type="button" variant="outline" onClick={() => void requestIdentityChange("email")} disabled={isSavingIdentity || !newEmail.trim() || !identityPassword}>Verify new email</Button></div><div className="space-y-2"><Label htmlFor="profile-new-phone">New phone</Label><CountryPhoneInput id="profile-new-phone" value={newPhone} onChange={setNewPhone} /><Button type="button" variant="outline" onClick={() => void requestIdentityChange("phone")} disabled={isSavingIdentity || !newPhone.trim() || !identityPassword}>Verify new phone</Button></div></div>
                  <div className="space-y-2"><Label htmlFor="identity-current-password">Current password</Label><Input id="identity-current-password" type="password" autoComplete="current-password" value={identityPassword} onChange={(event) => setIdentityPassword(event.target.value)} /></div>
                  {identityRequest && <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4"><div><p className="font-medium">Confirm new {identityRequest.type}</p><p className="text-xs text-muted-foreground">Pending destination: {identityRequestDestination || "verified destination"}. The code expires after ten minutes and can be attempted at most five times.</p></div><Label htmlFor="identity-verification-code">Verification code</Label><Input id="identity-verification-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={identityCode} onChange={(event) => setIdentityCode(event.target.value.replace(/\D/g, ""))} /><Button type="button" onClick={() => void confirmIdentityChange()} disabled={isSavingIdentity || identityCode.length !== 6}>{isSavingIdentity && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm verified change</Button></div>}
                </CardContent>
              </Card>}
            </TabsContent>

            <TabsContent value="security" className="mt-5 space-y-4">
              <div className="divide-y rounded-xl border bg-card" aria-label="Security settings">
                {([
                  ["password", Lock, "Password", "Change your password and preserve mandatory reauthentication.", "Protected"],
                  ["mfa", ShieldCheck, "Two-factor authentication", "Manage email, SMS, voice, authenticator, and recovery codes.", twoFactorEnabled ? methodLabel : "Not enabled"],
                  ["passkeys", Fingerprint, "Passkeys & biometric sign-in", "Use approved device biometrics, PINs, or security keys.", `${passkeys.length} registered`],
                  ["sessions", Laptop, "Devices, sessions & app lock", "Review access, revoke sessions, and manage inactivity protection.", `${sessions.filter((session) => !session.revoked_at).length} active`],
                ] as const).map(([section, Icon, title, description, status]) => (
                  <button key={section} type="button" className="flex w-full items-center gap-3 px-3 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-4" onClick={() => setActiveSecuritySection(section)} aria-expanded={activeSecuritySection === section}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block font-semibold text-foreground">{title}</span><span className="block text-xs leading-relaxed text-muted-foreground">{description}</span></span>
                    <Badge variant={activeSecuritySection === section ? "default" : "outline"} className="hidden shrink-0 sm:inline-flex">{status}</Badge>
                    <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", activeSecuritySection === section && "rotate-90 text-primary")} />
                  </button>
                ))}
              </div>
              {activeSecuritySection === "passkeys" && <Card className="border-primary/10 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><Fingerprint className="h-5 w-5 text-primary" /> Passkeys &amp; biometric sign-in</CardTitle>
                  <CardDescription>Use your device fingerprint, face, PIN, or security key through WebAuthn. CIMS never receives biometric data.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="passkey-name">Passkey name</Label><Input id="passkey-name" value={passkeyName} maxLength={120} onChange={(event) => setPasskeyName(event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="security-password">Current password</Label><Input id="security-password" type="password" autoComplete="current-password" value={securityPassword} onChange={(event) => setSecurityPassword(event.target.value)} /></div>
                  </div>
                  <Button type="button" onClick={registerPasskey} disabled={isRegisteringPasskey || !securityPassword || !passkeyName.trim()}>
                    {isRegisteringPasskey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fingerprint className="mr-2 h-4 w-4" />} Add passkey
                  </Button>
                  <Separator />
                  <div className="space-y-3">
                    {passkeys.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No passkeys registered.</p>}
                    {passkeys.map((passkey) => (
                      <div key={passkey.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div><p className="font-medium">{passkey.display_name}</p><p className="text-xs text-muted-foreground">Added {new Date(passkey.created_at).toLocaleDateString()} · {passkey.last_used_at ? `Last used ${new Date(passkey.last_used_at).toLocaleString()}` : "Never used"}</p></div>
                        <Button type="button" size="sm" variant="outline" onClick={() => removePasskey(passkey.id)}><Trash2 className="mr-2 h-4 w-4" /> Remove</Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>}
            </TabsContent>

            <TabsContent value="security" className="mt-0 space-y-4">
              {activeSecuritySection === "sessions" && <Card className="border-primary/10 shadow-sm">
                <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Laptop className="h-5 w-5 text-primary" /> Devices &amp; active sessions</CardTitle><CardDescription>Review recent account access and revoke sessions at the server.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="font-medium">Lock CIMS</p><p className="text-xs text-muted-foreground">Restricts this backend session and hides account data until password or passkey reauthentication. Sign out remains available on the lock screen.</p></div>
                    <Button type="button" variant="outline" onClick={lockApplication}><Lock className="mr-2 h-4 w-4" /> Lock app</Button>
                  </div>
                  {sessions.map((session) => (
                    <div key={session.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="font-medium">{session.device_name || session.browser_name || "Unknown device"} {session.current && <Badge className="ml-2">Current</Badge>}</p><p className="text-xs text-muted-foreground">Last active {new Date(session.last_activity_at).toLocaleString()} · {session.ip_address || "IP unavailable"}</p><p className="text-xs text-muted-foreground">{session.revoked_at ? "Revoked" : "Active"}</p></div>
                      {!session.revoked_at && <Button type="button" size="sm" variant="outline" onClick={() => revokeSession(session)}><LogOut className="mr-2 h-4 w-4" /> Revoke</Button>}
                    </div>
                  ))}
                  <Separator />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Lock after inactivity</Label><Select value={String(communicationPreferences.inactivity_timeout_minutes)} onValueChange={(value) => setCommunicationPreferences((current) => ({ ...current, inactivity_timeout_minutes: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[5, 10, 15, 30, 60].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes} minutes</SelectItem>)}</SelectContent></Select></div>
                    <div className="flex items-center justify-between gap-4 rounded-lg border p-4"><div><p className="font-medium">Lock after app resume</p><p className="text-xs text-muted-foreground">Lock after CIMS has been in the background for at least 30 seconds.</p></div><Switch checked={communicationPreferences.lock_on_resume} onCheckedChange={(checked) => setCommunicationPreferences((current) => ({ ...current, lock_on_resume: checked }))} aria-label="Lock after app resume" /></div>
                  </div>
                  <Button type="button" onClick={saveCommunicationPreferences} disabled={isSavingPreferences}>{isSavingPreferences ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Save app-lock settings</Button>
                </CardContent>
              </Card>}
            </TabsContent>

            <TabsContent value="preferences" className="mt-5 space-y-4">
              <Card className="border-primary/10 shadow-sm">
                <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Bell className="h-5 w-5 text-primary" /> Notifications &amp; preferences</CardTitle><CardDescription>Manage the existing messaging, calling, history, quiet-hours, and timezone preferences from one place.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  {([
                    ["notifications_enabled", "Browser and push notifications", "Allow eligible communication notifications."],
                    ["message_notifications", "Message notifications", "Notify me about new direct and group messages."],
                    ["call_notifications", "Call notifications", "Notify me about incoming and missed calls."],
                    ["keep_history", "Keep message history", "Preserve my eligible message history from rolling retention."],
                    ["do_not_disturb", "Do not disturb", "Suppress communication alerts until disabled."],
                    ["quiet_hours_enabled", "Quiet hours", "Suppress alerts during the configured time range."],
                  ] as const).map(([key, title, description]) => (
                    <div key={key} className="flex items-center justify-between gap-4 rounded-lg border p-4">
                      <div><p className="font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>
                      <Switch checked={communicationPreferences[key]} onCheckedChange={(checked) => setCommunicationPreferences((current) => ({ ...current, [key]: checked }))} aria-label={title} />
                    </div>
                  ))}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2 sm:col-span-1"><Label htmlFor="preference-timezone">Timezone</Label><Input id="preference-timezone" value={communicationPreferences.timezone} onChange={(event) => setCommunicationPreferences((current) => ({ ...current, timezone: event.target.value }))} placeholder="Africa/Nairobi" /></div>
                    <div className="space-y-2"><Label htmlFor="quiet-hours-start">Quiet hours start</Label><Input id="quiet-hours-start" type="time" value={communicationPreferences.quiet_hours_start} onChange={(event) => setCommunicationPreferences((current) => ({ ...current, quiet_hours_start: event.target.value }))} /></div>
                    <div className="space-y-2"><Label htmlFor="quiet-hours-end">Quiet hours end</Label><Input id="quiet-hours-end" type="time" value={communicationPreferences.quiet_hours_end} onChange={(event) => setCommunicationPreferences((current) => ({ ...current, quiet_hours_end: event.target.value }))} /></div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Language</Label><Select value={communicationPreferences.language} onValueChange={() => setCommunicationPreferences((current) => ({ ...current, language: "en" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">English is the verified default. Additional languages require complete translations before release.</p></div>
                    <div className="space-y-2"><Label>Theme</Label><Select value={communicationPreferences.theme} onValueChange={(theme) => setCommunicationPreferences((current) => ({ ...current, theme: theme as CommunicationPreferences["theme"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem><SelectItem value="system">System default</SelectItem></SelectContent></Select></div>
                  </div>
                  <Button type="button" className="w-full sm:w-auto" onClick={saveCommunicationPreferences} disabled={isSavingPreferences || !communicationPreferences.timezone.trim()}>
                    {isSavingPreferences ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Save preferences
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="mt-0 space-y-4">
              {activeSecuritySection === "mfa" && <Card className="border-primary/10 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><Fingerprint className="h-5 w-5 text-primary" /> Two-Factor Authentication</CardTitle>
                  <CardDescription>Require a one-time code after your password for CIMS and Developers access.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                    <div>
                      <p className="font-medium">Enable 2FA</p>
                      <p className="text-xs text-muted-foreground">Current method: {twoFactorEnabled ? methodLabel : "Not enabled"}</p>
                    </div>
                    <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} aria-label="Enable two-factor authentication" />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Verification method</Label>
                      <Select value={twoFactorMethod} onValueChange={(value) => { setTwoFactorMethod(value as "email" | "sms" | "call" | "totp"); setTotpEnrollment(null); setTwoFactorCode(""); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email code</SelectItem>
                          <SelectItem value="sms">SMS code</SelectItem>
                          <SelectItem value="call">Voice call</SelectItem>
                          <SelectItem value="totp">Authenticator app</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(twoFactorMethod === "sms" || twoFactorMethod === "call") && (
                      <div className="space-y-2">
                        <Label htmlFor="two-factor-phone">Verification phone</Label>
                        <CountryPhoneInput id="two-factor-phone" value={twoFactorPhone} onChange={setTwoFactorPhone} />
                      </div>
                    )}
                  </div>

                  {twoFactorChallengeId && (
                    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <Label htmlFor="two-factor-code">Enrollment verification code</Label>
                      <Input id="two-factor-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, ""))} />
                      <p className="text-xs text-muted-foreground">{twoFactorHint}</p>
                    </div>
                  )}

                  {twoFactorMethod === "totp" && totpEnrollment && (
                    <div className="grid gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:grid-cols-[auto_1fr]">
                      <img src={totpEnrollment.qrCodeDataUrl} alt="Authenticator enrollment QR code" className="mx-auto h-48 w-48 rounded-lg border bg-white p-2" />
                      <div className="min-w-0 space-y-3">
                        <div><p className="font-medium">Scan with your authenticator app</p><p className="text-xs text-muted-foreground">If scanning is unavailable, enter this one-time setup secret manually. It is hidden after activation.</p></div>
                        <code className="block break-all rounded-md border bg-background p-3 text-xs" aria-label="Manual authenticator setup secret">{totpEnrollment.secret}</code>
                        <div className="space-y-2"><Label htmlFor="totp-confirm-code">Current six-digit code</Label><Input id="totp-confirm-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, ""))} /></div>
                      </div>
                    </div>
                  )}

                  {twoFactorMethod === "totp" && totpActive && !totpEnrollment && recoveryCodes.length === 0 && (
                    <div className="space-y-2 rounded-lg border p-4">
                      <p className="font-medium">Authenticator verification</p>
                      <p className="text-xs text-muted-foreground">{recoveryCodesRemaining} unused recovery codes remain. Enter a current authenticator code when disabling or regenerating security credentials.</p>
                      <Label htmlFor="totp-security-code">Current authenticator code</Label>
                      <Input id="totp-security-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, ""))} />
                    </div>
                  )}

                  {recoveryCodes.length > 0 && (
                    <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4" role="status">
                      <div><p className="font-semibold">Save your one-time recovery codes now</p><p className="text-xs text-muted-foreground">Each code works once. They cannot be displayed again after this dialog closes.</p></div>
                      <div className="grid gap-2 font-mono text-sm sm:grid-cols-2">{recoveryCodes.map((code) => <code key={code} className="rounded border bg-background px-3 py-2">{code}</code>)}</div>
                      <Button type="button" variant="outline" size="sm" onClick={() => { void navigator.clipboard?.writeText(recoveryCodes.join("\n")); toast({ title: "Recovery codes copied" }); }}>Copy recovery codes</Button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="two-factor-password">Current password</Label>
                    <Input id="two-factor-password" type="password" autoComplete="current-password" value={twoFactorPassword} onChange={(event) => setTwoFactorPassword(event.target.value)} />
                    <p className="text-xs text-muted-foreground">Required to enable, change, or disable two-factor authentication.</p>
                  </div>

                  <Button type="button" className="w-full" onClick={handleSaveTwoFactor} disabled={isSavingTwoFactor || !twoFactorPassword || (twoFactorEnabled && (twoFactorMethod === "sms" || twoFactorMethod === "call") && !twoFactorPhone.trim()) || (twoFactorMethod === "totp" && (Boolean(totpEnrollment) || totpActive) && twoFactorCode.length !== 6)}>
                    {isSavingTwoFactor ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    {twoFactorMethod === "totp" ? (totpEnrollment ? "Confirm authenticator app" : !twoFactorEnabled ? "Disable authenticator MFA" : totpActive ? "Regenerate recovery codes" : "Set up authenticator app") : twoFactorChallengeId ? "Confirm & enable 2FA" : "Save 2FA Settings"}
                  </Button>
                </CardContent>
              </Card>}

              {activeSecuritySection === "password" && <Card className="border-primary/10 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><Lock className="h-5 w-5 text-primary" /> Change Password</CardTitle>
                  <CardDescription>Use at least 8 characters. You will be asked to sign in again after saving.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="old-password">Current password</Label>
                    <div className="relative">
                      <Input id="old-password" type={showOldPassword ? "text" : "password"} value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} className="pr-10" autoComplete="current-password" />
                      <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowOldPassword((value) => !value)} aria-label="Toggle current password visibility">
                        {showOldPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New password</Label>
                      <div className="relative">
                        <Input id="new-password" type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="pr-10" autoComplete="new-password" />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowNewPassword((value) => !value)} aria-label="Toggle new password visibility">
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm password</Label>
                      <div className="relative">
                        <Input id="confirm-password" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="pr-10" autoComplete="new-password" />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowConfirmPassword((value) => !value)} aria-label="Toggle confirm password visibility">
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      {confirmPassword && newPassword === confirmPassword && (
                        <p className="flex items-center gap-1 text-xs text-success"><CheckCircle className="h-3 w-3" /> Passwords match</p>
                      )}
                    </div>
                  </div>

                  <Separator />
                  <Button type="button" className="w-full" onClick={handleChangePassword} disabled={isChangingPassword || !oldPassword || !newPassword || !confirmPassword}>
                    {isChangingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                    Change Password
                  </Button>
                </CardContent>
              </Card>}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
