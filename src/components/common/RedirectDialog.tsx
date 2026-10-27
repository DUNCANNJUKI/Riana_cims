import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ExternalLink } from "lucide-react";

interface RedirectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetUrl: string;
  targetName: string;
}

export const RedirectDialog = ({ isOpen, onClose, targetUrl, targetName }: RedirectDialogProps) => {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (isOpen) {
      setCountdown(3);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            window.open(targetUrl, '_blank');
            onClose();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isOpen, targetUrl, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-xl">
            <ExternalLink className="h-6 w-6 text-primary animate-pulse" />
            Redirecting to {targetName}
          </DialogTitle>
          <DialogDescription className="text-center pt-4 space-y-4">
            <div className="flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
            </div>
            <p className="text-lg">
              You're being redirected to <strong className="text-primary">{targetName}</strong>
            </p>
            <p className="text-sm text-muted-foreground">
              A new tab will open in <span className="font-bold text-primary text-lg">{countdown}</span> second{countdown !== 1 ? 's' : ''}...
            </p>
            <p className="text-xs text-muted-foreground">
              {targetUrl}
            </p>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
};
