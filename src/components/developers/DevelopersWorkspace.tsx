import { useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { API_URL, getAuthToken } from "@/integrations/apiClient";

interface DevelopersWorkspaceProps {
  userId: string;
  role: 'Admin' | 'Teamlead' | 'Developer' | 'Sales';
}

const getDevelopersUrl = () => {
  return new URL("/developers/", API_URL).toString();
};

export const DevelopersWorkspace = ({ userId, role }: DevelopersWorkspaceProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const developersUrl = useMemo(getDevelopersUrl, []);
  const developersOrigin = useMemo(() => new URL(developersUrl).origin, [developersUrl]);

  const shareSession = useCallback((frame: HTMLIFrameElement) => {
    const token = getAuthToken();
    if (token) {
      frame.contentWindow?.postMessage(
        { type: "riana:crms-session", token, userId, role },
        developersOrigin,
      );
    }
    setIsLoading(false);
  }, [developersOrigin, role, userId]);

  return (
    <section className="relative h-[calc(100vh-11rem)] min-h-[560px] overflow-hidden rounded-xl border bg-card shadow-sm">
      {isLoading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading Developers workspace…</span>
          </div>
        </div>
      ) : null}
      <iframe
        title="RIANA Developers change-request workspace"
        src={developersUrl}
        className="h-full w-full border-0 bg-background"
        onLoad={(event) => shareSession(event.currentTarget)}
        allow="clipboard-read; clipboard-write"
      />
    </section>
  );
};
