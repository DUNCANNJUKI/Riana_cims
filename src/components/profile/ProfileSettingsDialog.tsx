import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Camera, Lock, Loader2, Eye, EyeOff, CheckCircle, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/apiClient";
import { User as UserType } from "@/types";

interface ProfileSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType;
  onProfileUpdate?: () => void;
}

export const ProfileSettingsDialog = ({ isOpen, onClose, user, onProfileUpdate }: ProfileSettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState("profile");
  const [isUploading, setIsUploading] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<'email' | 'sms' | 'call'>('email');
  const [twoFactorPhone, setTwoFactorPhone] = useState(user.phone_number || '');
  const [isSavingTwoFactor, setIsSavingTwoFactor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    apiClient.get('/auth/2fa-settings').then((settings) => {
      setTwoFactorEnabled(Boolean(settings.two_factor_enabled));
      setTwoFactorMethod(settings.two_factor_method || 'email');
      setTwoFactorPhone(settings.two_factor_phone || settings.phone_number || '');
    }).catch(() => undefined);
  }, [isOpen]);

  const handleSaveTwoFactor = async () => {
    setIsSavingTwoFactor(true);
    try {
      await apiClient.patch('/auth/2fa-settings', {
        enabled: twoFactorEnabled,
        method: twoFactorMethod,
        phone: twoFactorPhone,
      });
      toast({ title: "Two-factor authentication updated", description: twoFactorEnabled ? `Login codes will use ${twoFactorMethod}.` : "Two-factor authentication is disabled." });
    } catch (error) {
      toast({ title: "Unable to update 2FA", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setIsSavingTwoFactor(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File Type",
        description: "Please select an image file (JPG, PNG, GIF)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Image size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const uploadResponse = await apiClient.post('/upload', {
            fileName: `avatar-${user.id}-${Date.now()}.${file.name.split('.').pop()}`,
            base64Data
          });

          // Update user profile with avatar path
          await apiClient.put(`/user_profiles/${user.id}`, {
            ...user,
            phone_number: user.phone_number || '', // Ensure we don't lose data
            // We might need a separate field for avatar, but for now let's just use the response
          });

          setAvatarUrl(`${import.meta.env.VITE_API_BASE_URL}/uploads/${uploadResponse.filePath}`);
          
          toast({
            title: "Profile Picture Updated",
            description: "Your profile picture has been updated successfully",
          });

          onProfileUpdate?.();
        } catch (error: any) {
          console.error('Inner upload error:', error);
          toast({
            title: "Upload Failed",
            description: error.message || "Failed to process profile picture",
            variant: "destructive",
          });
        } finally {
          setIsUploading(false);
        }
      };

      reader.onerror = () => {
        toast({
          title: "Read Failed",
          description: "Failed to read the selected file",
          variant: "destructive",
        });
        setIsUploading(false);
      };
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload profile picture. Please try again.",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };

  const handleChangePassword = async () => {
    // Validation
    if (!oldPassword) {
      toast({
        title: "Error",
        description: "Please enter your current password",
        variant: "destructive",
      });
      return;
    }

    if (!newPassword) {
      toast({
        title: "Error",
        description: "Please enter a new password",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "New password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      // First, verify the old password
      const verifyResponse = await apiClient.post('/auth/verify-password', {
        email: user.email,
        password: oldPassword,
      });

      if (!verifyResponse.success) {
        toast({
          title: "Incorrect Password",
          description: "The current password you entered is incorrect",
          variant: "destructive",
        });
        return;
      }

      // Update the password
      await apiClient.patch(`/user_profiles/${user.id}/password`, {
        password: newPassword,
      });

      // Clear form
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");

      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully. Please log in again.",
      });

      // Logout user after password change
      setTimeout(() => {
        localStorage.removeItem('riana_auth_token');
        window.location.href = '/';
      }, 1500);

      onProfileUpdate?.();
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to change password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const getUserInitials = () => {
    if (user.first_name && user.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    return user.email.charAt(0).toUpperCase();
  };

  const getUserFullName = () => {
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return user.email;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Settings
          </DialogTitle>
          <DialogDescription>
            Manage your profile picture and account security
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Profile Picture</CardTitle>
                <CardDescription>
                  Upload a new profile picture (JPG, PNG, max 5MB)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <Avatar className="h-24 w-24 ring-4 ring-primary/20">
                      <AvatarImage src={avatarUrl || undefined} alt={getUserFullName()} />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-2xl font-bold">
                        {getUserInitials()}
                      </AvatarFallback>
                    </Avatar>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full shadow-lg"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{getUserFullName()}</h3>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <p className="text-sm text-muted-foreground">{user.role} • {user.designation || 'No designation'}</p>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Camera className="h-4 w-4 mr-2" />
                        Change Profile Picture
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" /> Two-Factor Authentication
                </CardTitle>
                <CardDescription>
                  Require a one-time code after your password for both CIMS and Developers access.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Enable 2FA</p>
                    <p className="text-xs text-muted-foreground">Protect {user.email}</p>
                  </div>
                  <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} />
                </div>

                <div className="space-y-2">
                  <Label>Verification method</Label>
                  <Select value={twoFactorMethod} onValueChange={(value) => setTwoFactorMethod(value as 'email' | 'sms' | 'call')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email code</SelectItem>
                      <SelectItem value="sms">SMS code</SelectItem>
                      <SelectItem value="call">Voice call</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {twoFactorMethod !== 'email' && (
                  <div className="space-y-2">
                    <Label htmlFor="two-factor-phone">Verification phone</Label>
                    <Input
                      id="two-factor-phone"
                      type="tel"
                      value={twoFactorPhone}
                      onChange={(event) => setTwoFactorPhone(event.target.value)}
                      placeholder="+254..."
                    />
                  </div>
                )}

                <Button
                  type="button"
                  className="w-full"
                  onClick={handleSaveTwoFactor}
                  disabled={isSavingTwoFactor || (twoFactorEnabled && twoFactorMethod !== 'email' && !twoFactorPhone.trim())}
                >
                  {isSavingTwoFactor ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  Save 2FA Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Change Password</CardTitle>
                <CardDescription>
                  Update your password by entering your current password first
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="old-password">Current Password *</Label>
                  <div className="relative">
                    <Input
                      id="old-password"
                      type={showOldPassword ? "text" : "password"}
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowOldPassword(!showOldPassword)}
                    >
                      {showOldPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password *</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 6 characters)"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password *</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {confirmPassword && newPassword === confirmPassword && (
                    <p className="text-xs text-success flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Passwords match
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <Button
                    onClick={handleChangePassword}
                    disabled={isChangingPassword || !oldPassword || !newPassword || !confirmPassword}
                    className="w-full gradient-primary"
                  >
                    {isChangingPassword ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Changing Password...
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4 mr-2" />
                        Change Password
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
