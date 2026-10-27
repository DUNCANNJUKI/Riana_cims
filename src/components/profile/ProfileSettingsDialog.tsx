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
import { Camera, CheckCircle, Eye, EyeOff, Fingerprint, Lock, Loader2, Mail, Phone, ShieldCheck, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/apiClient";
import { User as UserType } from "@/types";
import { CountryPhoneInput } from "@/components/common/CountryPhoneInput";
import { formatRoleLabel } from "@/utils/roleLabel";
import { resolveAvatarUrl } from "@/utils/avatar";

interface ProfileSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType;
  onProfileUpdate?: () => void | Promise<void>;
}

export const ProfileSettingsDialog = ({ isOpen, onClose, user, onProfileUpdate }: ProfileSettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState("profile");
  const [isUploading, setIsUploading] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(() => resolveAvatarUrl(user.avatar_url));
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<"email" | "sms" | "call">("email");
  const [twoFactorPhone, setTwoFactorPhone] = useState(user.phone_number || "");
  const [isSavingTwoFactor, setIsSavingTwoFactor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    setAvatarUrl(resolveAvatarUrl(user.avatar_url));
    apiClient.get("/auth/2fa-settings").then((settings) => {
      setTwoFactorEnabled(Boolean(settings.two_factor_enabled));
      setTwoFactorMethod(settings.two_factor_method || "email");
      setTwoFactorPhone(settings.two_factor_phone || settings.phone_number || "");
    }).catch(() => undefined);
  }, [isOpen, user.avatar_url]);

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

  const handleSaveTwoFactor = async () => {
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
      });
      setTwoFactorEnabled(Boolean(settings.enabled));
      setTwoFactorMethod(settings.method || "email");
      setTwoFactorPhone(settings.phone || "");
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

      await apiClient.patch("/auth/password", { password: newPassword });
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

  const methodLabel = twoFactorMethod === "email" ? "Email code" : twoFactorMethod === "sms" ? "SMS code" : "Voice call";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="border-b bg-muted/30 px-5 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <User className="h-5 w-5 text-primary" />
            Profile Settings
          </DialogTitle>
          <DialogDescription>Manage your profile photo, sign-in security, and account protection.</DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5 sm:px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mt-4 grid h-11 w-full grid-cols-2 rounded-lg bg-muted/70 p-1">
              <TabsTrigger value="profile" className="gap-2 rounded-md">
                <Camera className="h-4 w-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2 rounded-md">
                <ShieldCheck className="h-4 w-4" />
                Security
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-5 space-y-4">
              <Card className="overflow-hidden border-primary/10 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="relative w-fit">
                      <Avatar className="h-28 w-28 border-4 border-background shadow-lg ring-2 ring-primary/30">
                        <AvatarImage src={avatarUrl} alt={getUserFullName()} />
                        <AvatarFallback className="bg-primary text-2xl font-bold text-primary-foreground">{getUserInitials()}</AvatarFallback>
                      </Avatar>
                      <Button
                        type="button"
                        size="icon"
                        className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full shadow-md"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        aria-label="Change profile picture"
                      >
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      </Button>
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelect} />
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
                      <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                        {isUploading ? "Uploading..." : "Change Profile Picture"}
                      </Button>
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
            </TabsContent>

            <TabsContent value="security" className="mt-5 space-y-4">
              <Card className="border-primary/10 shadow-sm">
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
                      <Select value={twoFactorMethod} onValueChange={(value) => setTwoFactorMethod(value as "email" | "sms" | "call")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email code</SelectItem>
                          <SelectItem value="sms">SMS code</SelectItem>
                          <SelectItem value="call">Voice call</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {twoFactorMethod !== "email" && (
                      <div className="space-y-2">
                        <Label htmlFor="two-factor-phone">Verification phone</Label>
                        <CountryPhoneInput id="two-factor-phone" value={twoFactorPhone} onChange={setTwoFactorPhone} />
                      </div>
                    )}
                  </div>

                  <Button type="button" className="w-full" onClick={handleSaveTwoFactor} disabled={isSavingTwoFactor || (twoFactorEnabled && twoFactorMethod !== "email" && !twoFactorPhone.trim())}>
                    {isSavingTwoFactor ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Save 2FA Settings
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-primary/10 shadow-sm">
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
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};