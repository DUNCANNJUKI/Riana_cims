import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, CircleAlert, Clock3, PackageSearch, ShieldCheck } from "lucide-react";
import { API_URL } from "@/integrations/apiClient";

type PublicAssetHistory = {
  asset: { serial_number: string; model_number: string; family: string; nickname: string; status: string };
  history: Array<{ action: string; occurred_at: string }>;
};

const formatDate = (value: string) => new Intl.DateTimeFormat("en-KE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Nairobi",
}).format(new Date(value));

export function PublicAssetHistory() {
  const { assetId } = useParams<{ assetId: string }>();
  const [data, setData] = useState<PublicAssetHistory | null>(null);
  const [error, setError] = useState("");
  const validId = Boolean(assetId && /^[A-Za-z0-9-]{1,36}$/.test(assetId));

  useEffect(() => {
    if (!validId) {
      setError("This QR label is not valid.");
      return;
    }
    let active = true;
    fetch(`${API_URL}/public/hardware/${encodeURIComponent(assetId!)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Unable to load this asset history.");
        return body as PublicAssetHistory;
      })
      .then((body) => active && setData(body))
      .catch((reason: Error) => active && setError(reason.message));
    return () => { active = false; };
  }, [assetId, validId]);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="border-b border-border pb-5">
          <div className="flex items-center gap-3 text-primary">
            <ShieldCheck className="h-7 w-7" aria-hidden="true" />
            <span className="text-sm font-semibold uppercase tracking-wide">RIANA CIMS Asset Record</span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold">Equipment history</h1>
          <p className="mt-1 text-sm text-muted-foreground">Public verification view. Sign in for operational and sensitive record details.</p>
        </header>

        {!data && !error && <div className="flex items-center gap-3 py-12 text-muted-foreground"><Clock3 className="h-5 w-5 animate-pulse" /> Loading asset history...</div>}
        {error && <section className="border border-destructive/40 bg-destructive/5 p-5" role="alert"><div className="flex gap-3"><CircleAlert className="h-5 w-5 text-destructive" /><div><h2 className="font-semibold">Asset history unavailable</h2><p className="mt-1 text-sm text-muted-foreground">{error}</p></div></div></section>}
        {data && <>
          <section className="border border-border p-5">
            <div className="flex items-start gap-3">
              <PackageSearch className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold">{data.asset.serial_number}</p>
                <p className="mt-1 text-sm text-muted-foreground">{data.asset.family} · {data.asset.nickname} · {data.asset.model_number}</p>
                <p className="mt-3 inline-flex border border-border px-2 py-1 text-xs font-medium">Current status: {data.asset.status}</p>
              </div>
            </div>
          </section>
          <section aria-labelledby="asset-timeline-heading">
            <h2 id="asset-timeline-heading" className="text-base font-semibold">Lifecycle history</h2>
            {data.history.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No public lifecycle events have been recorded yet.</p> : <ol className="mt-3 divide-y divide-border border-y border-border">{data.history.map((entry, index) => <li key={`${entry.occurred_at}-${index}`} className="flex gap-3 py-4"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><div><p className="text-sm font-medium">{entry.action}</p><time className="text-xs text-muted-foreground">{formatDate(entry.occurred_at)}</time></div></li>)}</ol>}
          </section>
        </>}
        <footer className="border-t border-border pt-5 text-sm text-muted-foreground">Need authorized inventory details? <Link className="font-medium text-primary underline underline-offset-4" to={validId ? `/?hardware=${encodeURIComponent(assetId!)}` : "/"}>Sign in</Link></footer>
      </div>
    </main>
  );
}
