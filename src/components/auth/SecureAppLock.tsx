import { useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint, Loader2, LockKeyhole, LogOut } from "lucide-react";
import { apiClient } from "@/integrations/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_LOCK_STATE_KEY, REQUEST_APP_LOCK_EVENT } from "@/utils/appLock";

export function SecureAppLock({ active, onLogout }: { active: boolean; onLogout: () => void }) {
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const publishState = (nextLocked: boolean) => {
    localStorage.setItem(APP_LOCK_STATE_KEY, JSON.stringify({ locked: nextLocked, at: Date.now() }));
    setLocked(nextLocked);
  };

  useEffect(() => {
    if (!active) return;
    void apiClient.get("/auth/session-status").then((status) => setLocked(Boolean(status.locked))).catch((requestError) => {
      if ((requestError as Error & { status?: number }).status === 423) setLocked(true);
    });
    const lock = async (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: "manual" | "inactivity" | "resume" }>).detail?.reason || "manual";
      window.dispatchEvent(new CustomEvent("riana-call-control", { detail: { action: "hangup" } }));
      setBusy(true);
      setError("");
      try {
        await apiClient.post("/auth/lock", { reason });
        publishState(true);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to lock CIMS securely.");
      } finally { setBusy(false); }
    };
    const forcedLock = () => publishState(true);
    const storage = (event: StorageEvent) => {
      if (event.key !== APP_LOCK_STATE_KEY || !event.newValue) return;
      try { setLocked(Boolean(JSON.parse(event.newValue).locked)); } catch { /* Ignore invalid local events. */ }
    };
    window.addEventListener(REQUEST_APP_LOCK_EVENT, lock);
    window.addEventListener("riana-session-locked", forcedLock);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(REQUEST_APP_LOCK_EVENT, lock);
      window.removeEventListener("riana-session-locked", forcedLock);
      window.removeEventListener("storage", storage);
    };
  }, [active]);

  useEffect(() => {
    const shell = document.getElementById("cims-authenticated-shell");
    if (!shell) return;
    if (locked) {
      shell.setAttribute("inert", "");
      shell.setAttribute("aria-hidden", "true");
    } else {
      shell.removeAttribute("inert");
      shell.removeAttribute("aria-hidden");
    }
    return () => { shell.removeAttribute("inert"); shell.removeAttribute("aria-hidden"); };
  }, [locked]);

  const unlockWithPassword = async () => {
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      await apiClient.post("/auth/unlock/password", { password });
      setPassword("");
      publishState(false);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unlock failed."); }
    finally { setBusy(false); }
  };

  const unlockWithPasskey = async () => {
    setBusy(true);
    setError("");
    try {
      const challenge = await apiClient.post("/auth/unlock/passkey-options", {});
      const response = await startAuthentication({ optionsJSON: challenge.options });
      await apiClient.post("/auth/unlock/passkey-verify", { challengeId: challenge.challengeId, response });
      publishState(false);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Passkey unlock failed."); }
    finally { setBusy(false); }
  };

  if (!active) return null;
  if (!locked) return error ? <div className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border border-destructive/20 bg-background p-4 text-sm text-destructive shadow-lg" role="alert">{error}</div> : null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-background p-4" role="dialog" aria-modal="true" aria-labelledby="app-lock-title">
      <div className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-2xl">
        <div className="flex items-start gap-3"><span className="rounded-full bg-primary/10 p-3"><LockKeyhole className="h-6 w-6 text-primary" /></span><div><h1 id="app-lock-title" className="text-xl font-semibold">CIMS is locked</h1><p className="text-sm text-muted-foreground">Protected API access and the workspace remain restricted until you verify your identity.</p></div></div>
        <div className="space-y-2"><Label htmlFor="app-unlock-password">Account password</Label><Input id="app-unlock-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void unlockWithPassword(); }} autoFocus /></div>
        {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="grid gap-2 sm:grid-cols-2"><Button onClick={() => void unlockWithPassword()} disabled={busy || !password}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}Unlock</Button><Button variant="outline" onClick={() => void unlockWithPasskey()} disabled={busy}><Fingerprint className="mr-2 h-4 w-4" />Use passkey</Button></div>
        <Button variant="ghost" className="w-full" onClick={onLogout} disabled={busy}><LogOut className="mr-2 h-4 w-4" />Sign out instead</Button>
        <p className="text-center text-xs text-muted-foreground">Unlock requires the server. If offline, reconnect or sign out. Calls and local media are ended when locking.</p>
      </div>
    </div>
  );
}
