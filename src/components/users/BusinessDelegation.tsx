import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/integrations/apiClient";

export function BusinessDelegation({ userId, primaryId, subsidiaries }: {
  userId: string;
  primaryId: string | null | undefined;
  subsidiaries: { id: string; subsidiary_name: string }[];
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let current = true;
    void apiClient.get(`/business/delegations/${encodeURIComponent(userId)}`).then(result => {
      if (current) setIds(result.subsidiary_ids);
    }).catch(() => {
      if (current) { setFailed(true); setStatus("Unable to load delegated subsidiaries."); }
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [userId]);

  const save = async () => {
    setLoading(true);
    setStatus("");
    try {
      await apiClient.put(`/business/delegations/${encodeURIComponent(userId)}`, { subsidiary_ids: ids });
      setStatus("Delegated subsidiaries saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save delegated subsidiaries.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <fieldset disabled={loading || failed} className="min-w-0 space-y-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">Delegated subsidiaries</legend>
      <div className="max-h-40 space-y-2 overflow-auto text-sm">
        {subsidiaries.filter(item => item.id !== primaryId).map(item => (
          <label key={item.id} className="flex items-start gap-2">
            <input type="checkbox" checked={ids.includes(item.id)} onChange={event => {
              const checked = event.target.checked;
              setIds(current => checked ? [...current, item.id] : current.filter(id => id !== item.id));
            }} />
            <span className="break-words">{item.subsidiary_name}</span>
          </label>
        ))}
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => void save()}>Save delegated subsidiaries</Button>
      {status && <p className="text-sm" role="status">{status}</p>}
    </fieldset>
  );
}
