import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, Link, Mail, ExternalLink, AlertCircle, Clock, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDatabase } from "@/hooks/useDatabase";
import { useAuth } from "@/hooks/useAuth";
import { Client, Installation } from "@/types";
import { apiClient } from "@/integrations/apiClient";


interface FeedbackLinkGeneratorProps {
  client: Client;
  installation?: Installation;
  onClose?: () => void;
}

export const FeedbackLinkGenerator = ({ client, installation, onClose }: FeedbackLinkGeneratorProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string>("");
  const [linkExpiry, setLinkExpiry] = useState<string>("30"); // days
  const [existingLink, setExistingLink] = useState<any>(null);
  const [isCheckingExisting, setIsCheckingExisting] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();
  const {
    getFeedbackLinks, 
    createFeedbackLink,
  } = useDatabase();
  const buildFeedbackUrl = (token: string) => `${window.location.origin}/feedback/${encodeURIComponent(token)}`;

  // Check for existing active feedback link on mount
  useEffect(() => {
    if (client.id) {
      checkExistingLink();
    }
  }, [client.id, installation?.id]);

  const checkExistingLink = async () => {
    setIsCheckingExisting(true);
    try {
      const data = await getFeedbackLinks(client.id);
      
      // Filter for unused and non-expired links
      const activeLinks = data.filter((link: any) =>
        !link.is_used &&
        new Date(link.expires_at) > new Date() &&
        String(link.installation_id || '') === String(installation?.id || '')
      );

      if (activeLinks.length > 0) {
        const link = activeLinks[0];
        setExistingLink(link);
        setGeneratedLink(buildFeedbackUrl(link.unique_token));
      }
    } catch (error) {
      console.error('Error checking existing link:', error);
    } finally {
      setIsCheckingExisting(false);
    }
  };


  const generateFeedbackLink = async () => {
    // Check for existing active link first
    if (existingLink) {
      toast({
        title: "Active Link Exists",
        description: `A feedback link already exists for this client and expires on ${new Date(existingLink.expires_at).toLocaleDateString()}. Please wait until it expires to generate a new one.`,
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(linkExpiry));

      // Store feedback link in database - token is generated on backend
      const linkData = await createFeedbackLink({
        client_id: client.id,
        installation_id: installation?.id || null,
        expires_at: expiresAt.toISOString(),
        created_by_user_id: user?.id
      });

      setGeneratedLink(buildFeedbackUrl(linkData.unique_token));
      setExistingLink(linkData);

      toast({
        title: "Feedback Link Generated",
        description: "The unique feedback link has been created successfully.",
      });
    } catch (error) {
      console.error('Error generating feedback link:', error);
      toast({
        title: "Error",
        description: "Failed to generate feedback link",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      toast({
        title: "Copied!",
        description: "Feedback link copied to clipboard",
      });
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const sendFeedbackToClient = async () => {
    try {
      if (!existingLink?.id) throw new Error('Generate a feedback link before sending it.');
      const result = await apiClient.post(`/feedback_links/${existingLink.id}/send`, {});
      setExistingLink((current: any) => current ? {
        ...current,
        email_sent: result.email_sent,
        sms_sent: result.sms_sent,
      } : current);
      const deliveredChannels = [result.email_sent ? 'email' : '', result.sms_sent ? 'SMS' : ''].filter(Boolean).join(' and ');

      toast({
        title: "Feedback Link Sent",
        description: `Feedback link sent via ${deliveredChannels || 'the configured channel'} to ${client.contact_person_name}.`,
      });
    } catch (error) {
      console.error('Error sending feedback link:', error);
      toast({
        title: "Delivery failed",
        description: error instanceof Error ? error.message : 'Could not send the feedback link.',
        variant: "destructive",
      });
    }
  };


  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link className="h-5 w-5" />
          Generate Feedback Link
        </CardTitle>
        <CardDescription>
          Create a unique feedback link for {client.client_name}
          {client.branch && ` - ${client.branch}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/30 p-4 rounded-lg">
          <h4 className="font-medium mb-2">Client Information</h4>
          <div className="text-sm space-y-1">
            <p><span className="font-medium">Client:</span> {client.client_name}</p>
            <p><span className="font-medium">Contact:</span> {client.contact_person_name}</p>
            <p><span className="font-medium">Industry:</span> {client.industry_classification}</p>
            {client.branch && <p><span className="font-medium">Branch:</span> {client.branch}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="expiry">Link Expiry (days)</Label>
          <Select value={linkExpiry} onValueChange={setLinkExpiry}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

          {isCheckingExisting ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Checking for existing links...</span>
            </div>
          ) : existingLink && generatedLink ? (
            <div className="space-y-4">
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-warning">Active Link Exists</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3" />
                    Expires: {new Date(existingLink.expires_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Existing Feedback Link</Label>
                <div className="flex gap-2">
                  <Input 
                    value={generatedLink} 
                    readOnly 
                    className="font-mono text-sm"
                  />
                  <Button onClick={copyToClipboard} variant="outline" size="icon">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={sendFeedbackToClient} variant="outline" className="flex-1 transition-all hover:scale-[1.02] active:scale-95">
                  <Mail className="h-4 w-4 mr-2" />
                  Send to Client
                </Button>
                <Button 
                  onClick={() => window.open(generatedLink, '_blank')} 
                  variant="outline"
                  className="flex-1 transition-all hover:scale-[1.02] active:scale-95"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Preview Form
                </Button>
              </div>

              {onClose && (
                <Button onClick={onClose} variant="outline" className="w-full">
                  Close
                </Button>
              )}
            </div>
          ) : !generatedLink ? (
          <Button 
            onClick={generateFeedbackLink} 
            disabled={isGenerating}
            className="w-full gradient-primary transition-all hover:scale-[1.02] active:scale-95"
          >
            {isGenerating ? 'Generating...' : 'Generate Feedback Link'}
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Generated Feedback Link</Label>
              <div className="flex gap-2">
                <Input 
                  value={generatedLink} 
                  readOnly 
                  className="font-mono text-sm"
                />
                <Button onClick={copyToClipboard} variant="outline" size="icon">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={sendFeedbackToClient} variant="outline" className="flex-1 transition-all hover:scale-[1.02] active:scale-95">
                <Mail className="h-4 w-4 mr-2" />
                Send to Client
              </Button>
              <Button 
                onClick={() => window.open(generatedLink, '_blank')} 
                variant="outline"
                className="flex-1 transition-all hover:scale-[1.02] active:scale-95"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Preview Form
              </Button>
            </div>

            <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/20 p-3 rounded">
              <p className="font-medium mb-1">Next Steps:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Copy the link and share it with the client</li>
                <li>Or email it directly to the contact person</li>
                <li>The form will be customized for {client.industry_classification} industry</li>
                <li>Link expires in {linkExpiry} days</li>
              </ul>
            </div>

            {onClose && (
              <Button onClick={onClose} variant="outline" className="w-full">
                Close
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
