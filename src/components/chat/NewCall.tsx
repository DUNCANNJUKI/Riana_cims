import { useState } from "react";
import { Phone, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ChatUser } from "@/hooks/useChat";

export function NewCall({ users, loading, disabled, onStart }: {
  users: ChatUser[];
  loading: boolean;
  disabled: boolean;
  onStart: (type: "audio" | "video", userIds: string[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const eligibleSelection = selected.filter(id => users.some(user => user.id === id));
  const searchTerm = search.trim().toLowerCase();
  const matches = users.filter(user => [user.first_name, user.last_name, user.email].filter(Boolean).join(" ").toLowerCase().includes(searchTerm));

  const close = () => {
    setOpen(false);
    setSearch("");
    setSelected([]);
  };

  const start = async (type: "audio" | "video") => {
    if (starting || disabled || !eligibleSelection.length) return;
    setStarting(true);
    try {
      if (await onStart(type, eligibleSelection)) close();
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => {
      if (starting) return;
      if (next) setOpen(true);
      else close();
    }}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" disabled={disabled} className="w-full justify-center">
          <Phone aria-hidden="true" /> New call
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New call</DialogTitle>
          <DialogDescription>Select up to eight colleagues for an audio or video call.</DialogDescription>
        </DialogHeader>
        <Input aria-label="Search for call participants" placeholder="Search colleagues…" value={search} onChange={event => setSearch(event.target.value)} />
        <fieldset disabled={starting} className="min-w-0">
          <legend className="mb-2 text-sm font-medium">Participants ({eligibleSelection.length}/8)</legend>
          <div className="max-h-56 overflow-y-auto overscroll-contain rounded-md border p-1">
            {matches.map(user => (
              <label key={user.id} className="flex min-h-10 items-center gap-2 rounded px-3 py-2 text-sm hover:bg-muted">
                <input type="checkbox" className="shrink-0 accent-primary" checked={eligibleSelection.includes(user.id)}
                  disabled={eligibleSelection.length >= 8 && !eligibleSelection.includes(user.id)}
                  onChange={event => {
                    const checked = event.target.checked;
                    setSelected(checked ? [...eligibleSelection, user.id] : eligibleSelection.filter(id => id !== user.id));
                  }} />
                <span className="min-w-0 break-words">{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}</span>
              </label>
            ))}
            {!matches.length && (
              <p role="status" className="p-3 text-sm text-muted-foreground">{loading ? "Loading colleagues…" : searchTerm ? "No matching colleagues." : "No colleagues available."}</p>
            )}
          </div>
        </fieldset>
        <div className="grid gap-2 min-[360px]:grid-cols-2">
          <Button type="button" variant="outline" disabled={disabled || starting || !eligibleSelection.length} onClick={() => void start("audio")}>
            <Phone aria-hidden="true" /> Audio call
          </Button>
          <Button type="button" disabled={disabled || starting || !eligibleSelection.length} onClick={() => void start("video")}>
            <Video aria-hidden="true" /> Video call
          </Button>
        </div>
        {starting && <p role="status" className="text-sm text-muted-foreground">Starting call…</p>}
      </DialogContent>
    </Dialog>
  );
}
