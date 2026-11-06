import { useEffect, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InactivityGuardProps {
  active: boolean;
  onLock: () => void;
  timeoutMinutes: number;
}

export function InactivityGuard({ active, onLock, timeoutMinutes }: InactivityGuardProps) {
  const onLockRef = useRef(onLock);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const countdownRef = useRef<ReturnType<typeof setInterval>>();
  const resetRef = useRef<() => void>(() => undefined);
  const [isWarning, setIsWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(60);

  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  useEffect(() => {
    const clearTimers = () => {
      clearTimeout(warningTimerRef.current);
      clearTimeout(logoutTimerRef.current);
      clearInterval(countdownRef.current);
    };

    const reset = () => {
      clearTimers();
      setIsWarning(false);
      setRemainingSeconds(60);
      if (!active) return;
      const lockAfterMs = Math.max(5, timeoutMinutes) * 60 * 1000;
      const warningAfterMs = Math.max(0, lockAfterMs - 60_000);

      warningTimerRef.current = setTimeout(() => {
        const deadline = Date.now() + (lockAfterMs - warningAfterMs);
        setIsWarning(true);
        countdownRef.current = setInterval(() => {
          setRemainingSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        }, 1000);
      }, warningAfterMs);

      logoutTimerRef.current = setTimeout(() => onLockRef.current(), lockAfterMs);
    };

    resetRef.current = reset;
    const activityEvents: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, reset, { passive: true }));
    reset();

    return () => {
      clearTimers();
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, reset));
    };
  }, [active, timeoutMinutes]);

  if (!active || !isWarning) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-warning/40 bg-background p-4 shadow-lg" role="alert">
      <Clock3 className="size-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Your session is about to expire</p>
        <p className="text-sm text-muted-foreground">CIMS will lock in {remainingSeconds} seconds due to inactivity.</p>
      </div>
      <Button size="sm" onClick={() => resetRef.current()}>Stay signed in</Button>
    </div>
  );
}
