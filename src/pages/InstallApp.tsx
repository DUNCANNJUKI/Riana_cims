import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Smartphone, 
  Download, 
  Share, 
  MoreVertical, 
  Plus, 
  ArrowDown,
  CheckCircle2,
  Bell,
  Wifi,
  WifiOff,
  Monitor
} from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallApp = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    const checkInstalled = () => {
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsInstalled(true);
        setIsStandalone(true);
      }
    };

    // Detect device type
    const ua = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsAndroid(/android/.test(ua));

    checkInstalled();

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header */}
      <header className="gradient-header text-white py-6 px-4">
        <div className="container mx-auto flex items-center gap-4">
          <img 
            src="/rianacims-uploads/5fe53914-47f9-4dab-ac6a-15b2a4002f36.png" 
            alt="RIANA Group" 
            className="h-12 w-auto"
          />
          <div>
            <h1 className="text-2xl font-bold">Install RIANA CIMS</h1>
            <p className="text-sm opacity-90">Get the app on your device</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Status Card */}
        {isStandalone ? (
          <Card className="border-success/50 bg-success/5">
            <CardContent className="flex items-center gap-4 py-6">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <div>
                <h2 className="text-xl font-bold text-success">App Already Installed!</h2>
                <p className="text-muted-foreground">You're using the installed version of RIANA CIMS</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-primary/50">
            <CardContent className="flex items-center gap-4 py-6">
              <Smartphone className="h-12 w-12 text-primary" />
              <div>
                <h2 className="text-xl font-bold">Install RIANA CIMS App</h2>
                <p className="text-muted-foreground">Access the system quickly from your home screen</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Features */}
        <Card className="shadow-riana">
          <CardHeader>
            <CardTitle>App Features</CardTitle>
            <CardDescription>What you get with the installed app</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                <Bell className="h-6 w-6 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium">Push Notifications</h3>
                  <p className="text-sm text-muted-foreground">Get instant alerts for new assignments and updates</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                <WifiOff className="h-6 w-6 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium">Offline Access</h3>
                  <p className="text-sm text-muted-foreground">View cached data even without internet</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                <Monitor className="h-6 w-6 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium">Full Screen Mode</h3>
                  <p className="text-sm text-muted-foreground">Enjoy a native app experience</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Installation Instructions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* iOS Instructions */}
          <Card className={`shadow-riana ${isIOS ? 'ring-2 ring-primary' : ''}`}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  iPhone / iPad
                </CardTitle>
                {isIOS && <Badge className="bg-primary">Your Device</Badge>}
              </div>
              <CardDescription>Install using Safari browser</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">1</div>
                  <div>
                    <p className="font-medium">Open in Safari</p>
                    <p className="text-sm text-muted-foreground">Make sure you're using Safari browser (not Chrome)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">2</div>
                  <div>
                    <p className="font-medium flex items-center gap-2">Tap the Share button <Share className="h-4 w-4" /></p>
                    <p className="text-sm text-muted-foreground">Located at the bottom of Safari</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">3</div>
                  <div>
                    <p className="font-medium">Scroll and tap "Add to Home Screen"</p>
                    <p className="text-sm text-muted-foreground">You may need to scroll down in the share menu</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">4</div>
                  <div>
                    <p className="font-medium">Tap "Add"</p>
                    <p className="text-sm text-muted-foreground">The app will appear on your home screen</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Share className="h-5 w-5 text-primary" />
                  <span className="font-medium">Look for this icon at the bottom of Safari</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Android Instructions */}
          <Card className={`shadow-riana ${isAndroid ? 'ring-2 ring-primary' : ''}`}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Android
                </CardTitle>
                {isAndroid && <Badge className="bg-primary">Your Device</Badge>}
              </div>
              <CardDescription>Install using Chrome browser</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {deferredPrompt ? (
                <div className="space-y-4">
                  <p className="text-muted-foreground">Click the button below to install directly:</p>
                  <Button 
                    onClick={handleInstallClick}
                    className="w-full gradient-primary text-lg py-6"
                    size="lg"
                  >
                    <Download className="h-5 w-5 mr-2" />
                    Install RIANA CIMS App
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">1</div>
                    <div>
                      <p className="font-medium">Open in Chrome</p>
                      <p className="text-sm text-muted-foreground">Make sure you're using Google Chrome browser</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">2</div>
                    <div>
                      <p className="font-medium flex items-center gap-2">Tap the menu button <MoreVertical className="h-4 w-4" /></p>
                      <p className="text-sm text-muted-foreground">Three dots at the top right corner</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">3</div>
                    <div>
                      <p className="font-medium flex items-center gap-2">Tap "Add to Home screen" <Plus className="h-4 w-4" /></p>
                      <p className="text-sm text-muted-foreground">Or "Install App" if available</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">4</div>
                    <div>
                      <p className="font-medium">Tap "Add" or "Install"</p>
                      <p className="text-sm text-muted-foreground">The app will be added to your home screen</p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <MoreVertical className="h-5 w-5 text-primary" />
                  <span className="font-medium">Look for ⋮ menu at the top right of Chrome</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Benefits */}
        <Card className="shadow-riana bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardHeader>
            <CardTitle>Why Install the App?</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>Quick access from home screen</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>Receive push notifications</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>Work offline with cached data</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>Full screen experience</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>Faster loading times</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>No app store required</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Back to App */}
        <div className="flex justify-center">
          <Button 
            variant="outline" 
            size="lg"
            onClick={() => window.location.href = '/'}
            className="transition-all hover:scale-[1.02]"
          >
            <ArrowDown className="h-4 w-4 mr-2 rotate-90" />
            Back to RIANA CIMS
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-4 px-4 text-center mt-8">
        <p className="text-xs text-muted-foreground">
          © {currentYear} RIANA Group. All rights reserved. | www.riana.co
        </p>
      </footer>
    </div>
  );
};

export default InstallApp;
