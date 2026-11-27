import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/integrations/apiClient";
import type { ChatUser } from "@/hooks/useChat";

export type ScheduledMeeting = {
  id: string;
  title: string;
  organizer_id: string;
  starts_at: string;
  call_type: "audio" | "video";
  status: "scheduled" | "started" | "cancelled";
  call_status?: string;
};

export function ScheduledMeetings({ userId, users, canStart, onStart }: {
  userId: string;
  users: ChatUser[];
  canStart: boolean;
  onStart: (meeting: ScheduledMeeting) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [meetings, setMeetings] = useState<ScheduledMeeting[] | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [callType, setCallType] = useState<"audio" | "video">("video");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const refresh = async () => setMeetings(await apiClient.get("/chat/scheduled-meetings") as ScheduledMeeting[]);
  useEffect(() => {
    if (!open) return;
    setError("");
    void refresh().catch(error => setError(error instanceof Error ? error.message : "Unable to load meetings."));
  }, [open]);

  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to update this meeting."); }
    finally { setBusy(false); }
  };
  const schedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void perform(async () => {
      await apiClient.post("/chat/scheduled-meetings", {
        title, starts_at: new Date(time).toISOString(), call_type: callType, participant_ids: selected,
      });
      setTitle("");
      setTime("");
      setSelected([]);
      await refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button aria-label="Scheduled meetings" title="Scheduled meetings" variant="ghost" size="icon" className="size-8 shrink-0"><CalendarDays className="size-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scheduled meetings</DialogTitle>
          <DialogDescription>Schedule a call with colleagues. The organizer starts it when ready.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
        {meetings === null && !error && <p role="status" className="text-sm text-muted-foreground">Loading meetings…</p>}
        {meetings?.length === 0 && <p className="text-sm text-muted-foreground">No scheduled meetings.</p>}
        {meetings?.length ? (
          <ul className="divide-y rounded-lg border">
            {meetings.map(meeting => (
              <li key={meeting.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0 break-words text-sm">
                  <p className="font-medium">{meeting.title}</p>
                  <p className="text-xs text-muted-foreground"><time dateTime={meeting.starts_at}>{new Date(meeting.starts_at).toLocaleString()}</time>
                    {" · "}{meeting.status === "started" ? (["ringing", "accepted"].includes(meeting.call_status || "") ? "In progress" : "Ended") : meeting.status === "cancelled" ? "Cancelled" : "Scheduled"}</p>
                </div>
                {meeting.organizer_id === userId && meeting.status === "scheduled" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy || !canStart} onClick={() => void perform(async () => { await onStart(meeting); setOpen(false); })}>Start</Button>
                    {confirmCancel === meeting.id ? (
                      <>
                        <Button size="sm" variant="destructive" disabled={busy} onClick={() => void perform(async () => {
                          await apiClient.post(`/chat/scheduled-meetings/${meeting.id}/cancel`, {});
                          setConfirmCancel(null);
                          await refresh();
                        })}>Confirm cancellation</Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(null)}>Keep meeting</Button>
                      </>
                    ) : <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmCancel(meeting.id)}>Cancel meeting</Button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <form onSubmit={schedule} className="grid gap-3 border-t pt-3 text-sm">
          <label className="grid gap-1">Meeting title<Input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label>
          <label className="grid gap-1">Start time <Input required type="datetime-local" value={time} onChange={event => setTime(event.target.value)} /></label>
          <label className="grid gap-1">Call type
            <select value={callType} onChange={event => setCallType(event.target.value === "audio" ? "audio" : "video")} className="rounded-md border border-input bg-background p-2">
              <option value="video">Video</option><option value="audio">Audio</option>
            </select>
          </label>
          <fieldset className="min-w-0">
            <legend className="mb-1 font-medium">Participants ({selected.length}/8)</legend>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
              {users.map(user => <label key={user.id} className="flex items-start gap-2 break-all">
                <input type="checkbox" className="mt-1" checked={selected.includes(user.id)} disabled={selected.length >= 8 && !selected.includes(user.id)}
                  onChange={event => setSelected(current => event.target.checked ? [...current, user.id] : current.filter(id => id !== user.id))} />
                {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
              </label>)}
              {!users.length && <p className="text-muted-foreground">No colleagues available.</p>}
            </div>
          </fieldset>
          <Button disabled={busy || !selected.length || !title.trim() || !time}>Schedule meeting</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
