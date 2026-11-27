import { useEffect, useState } from "react";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/hooks/useChat";

export function MeetingSummary({ call, joined, onOpen }: { call: ChatMessage; joined: boolean; onOpen: () => void }) {
  const started = call.call_started_at ? Date.parse(call.call_started_at) : NaN;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!Number.isFinite(started)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [started]);
  const elapsed = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : null;
  const organizerProfile = call.call_participants?.find(member => member.user_id === call.call_organizer_id);
  const organizer = [
    organizerProfile?.first_name ?? call.sender_first_name,
    organizerProfile?.last_name ?? call.sender_last_name,
  ].filter(Boolean).join(" ") || "A colleague";
  const participants = call.call_participants?.filter(participant => participant.status === "accepted").length ?? 0;
  const label = joined ? "Return to meeting" : call.can_rejoin ? "Rejoin" : "Join now";

  return (
    <section aria-label="Meeting" className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <Video className="size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{call.content || "Meeting"}</div>
        <p className="text-xs text-muted-foreground">
          {organizer} · {call.call_status === "accepted" ? "In progress" : "Waiting"} · {participants} joined
          {elapsed !== null && <> · <time dateTime={new Date(started).toISOString()}>{new Date(started).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time> · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</>}
        </p>
      </div>
      <Button type="button" size="sm" onClick={onOpen}>{label}</Button>
    </section>
  );
}
