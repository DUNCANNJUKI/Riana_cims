import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Mail, RefreshCw, Send, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/apiClient";

interface SmtpStatus {
  configured?: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  fromEmail?: string;
  testedAt?: string | null;
  success?: boolean | null;
  action?: string | null;
  error?: string | null;
  response?: string | null;
}

export const SmtpSettingsPanel = () => {
  const [status, setStatus] = useState<SmtpStatus>({});
  const [recipientEmail, setRecipientEmail] = useState("");
  const [loading, setLoading] = useState<"load" | "connection" | "send" | null>("load");
  const { toast } = useToast();

  const loadStatus = async () => {
    try {
      setStatus(await apiClient.get("/admin/email-configuration"));
    } catch (error) {
      toast({ title: "SMTP status unavailable", description: error instanceof Error ? error.message : "Unable to load SMTP status.", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  useEffect(() => { void loadStatus(); }, []);

  const runTest = async (action: "connection" | "send") => {
    if (action === "send" && !recipientEmail.trim()) {
      toast({ title: "Recipient required", description: "Enter the controlled recipient for the test email.", variant: "destructive" });
      return;
    }
    setLoading(action);
    try {
      const result = await apiClient.post("/admin/email-configuration/test", { action, recipientEmail: recipientEmail.trim() });
      setStatus(result);
      toast({ title: action === "send" ? "Test email accepted" : "SMTP connection verified", description: result.response || "The SMTP server accepted the test." });
    } catch (error) {
      await loadStatus();
      toast({ title: "SMTP test failed", description: error instanceof Error ? error.message : "The SMTP provider rejected the test.", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" /> SMTP Configuration</CardTitle>
          <CardDescription>Runtime values are read from the private Node environment. Passwords are never displayed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status.configured ? "default" : "destructive"}>{status.configured ? "Credentials configured" : "Credentials missing"}</Badge>
            <Badge variant="outline">{status.secure ? "SSL/TLS enabled" : "STARTTLS / insecure port"}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>SMTP Host</Label><Input value={status.host || "Not configured"} readOnly /></div>
            <div className="space-y-2"><Label>Port</Label><Input value={status.port ?? "Not configured"} readOnly /></div>
            <div className="space-y-2"><Label>Username</Label><Input value={status.user || "Not configured"} readOnly /></div>
            <div className="space-y-2"><Label>Sender</Label><Input value={status.fromEmail || "Not configured"} readOnly /></div>
          </div>
          <Button type="button" variant="outline" onClick={() => void runTest("connection")} disabled={loading !== null}>
            {loading === "connection" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Test Connection
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Send Test Email</CardTitle>
          <CardDescription>Sends a clearly labelled production test through the configured sender.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="smtp_test_recipient">Recipient Email</Label><Input id="smtp_test_recipient" type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="name@example.com" autoComplete="off" /></div>
          <Button type="button" onClick={() => void runTest("send")} disabled={loading !== null || !recipientEmail.trim()}>
            {loading === "send" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Send Test Email
          </Button>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium">
              {status.success === true ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : status.success === false ? <AlertCircle className="h-4 w-4 text-destructive" /> : <Mail className="h-4 w-4 text-muted-foreground" />}
              Last Test Status: {status.success === true ? "Successful" : status.success === false ? "Failed" : "Not tested"}
            </div>
            {status.testedAt && <p>Tested: {new Date(status.testedAt).toLocaleString()}</p>}
            {status.response && <p className="mt-1 break-words text-muted-foreground">SMTP response: {status.response}</p>}
            {status.error && <p className="mt-1 break-words text-destructive">Last error: {status.error}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
