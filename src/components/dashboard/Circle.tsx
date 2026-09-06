import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { relationHints } from "@/lib/trustlens";
import { useMutation, useQuery } from "convex/react";
import { BellRing, Plus, ShieldAlert, Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Circle() {
  const members = useQuery(api.circle.list);
  const addMember = useMutation(api.circle.add);
  const removeMember = useMutation(api.circle.remove);
  const setNotify = useMutation(api.circle.setNotify);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState("");
  const [notifyOnFlag, setNotifyOnFlag] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !relation.trim()) return;
    setBusy(true);
    try {
      await addMember({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        relation: relation.trim(),
        notifyOnFlag,
      });
      toast.success(`${name.trim()} added to the circle`);
      setName("");
      setPhone("");
      setEmail("");
      setRelation("");
      setNotifyOnFlag(true);
      setAdding(false);
    } catch {
      toast.error("Could not add member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="arch-label text-primary">Team alert routing</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
            The alert circle
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            When a call is flagged for you, these people are alerted
            automatically — with who, when, and the verdict, never the
            transcript.
          </p>
        </div>
        <Button type="button" className="gap-2" onClick={() => setAdding((a) => !a)}>
          <UserPlus className="size-4" />
          Add a member
        </Button>
      </div>

      {adding && (
        <form
          onSubmit={handleAdd}
          className="rounded-2xl border border-primary/30 bg-card p-5 shadow-[0_14px_36px_-28px_rgba(37,99,235,0.35)]"
        >
          <p className="arch-label mb-4 text-primary">
            New member · register
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-name" className="text-xs">
                Name
              </Label>
              <Input
                id="c-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rohan"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone" className="text-xs">
                Phone
              </Label>
              <Input
                id="c-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                inputMode="tel"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email" className="text-xs">
                Email <span className="text-muted-foreground">(for alerts)</span>
              </Label>
              <Input
                id="c-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                inputMode="email"
                type="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-rel" className="text-xs">
                Relation
              </Label>
              <Input
                id="c-rel"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                placeholder="e.g. Son"
                required
              />
            </div>
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-3">
            <Switch checked={notifyOnFlag} onCheckedChange={setNotifyOnFlag} />
            <span className="text-sm text-muted-foreground">
              Alert this member automatically on flagged calls
            </span>
          </label>
          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={busy} className="gap-2">
              <Plus className="size-4" />
              {busy ? "Registering…" : "Register"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {!members ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card/60" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <Empty className="rounded-2xl border-border bg-card">
          <EmptyMedia variant="icon">
            <Users className="size-6" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No one in the circle yet</EmptyTitle>
            <EmptyDescription>
              Add a teammate who should hear about flagged calls the moment
              they land — a fraud desk, a support lead, or family. They'll know
              within seconds.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" className="gap-2" onClick={() => setAdding(true)}>
              <UserPlus className="size-4" />
              Add your first member
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {members.map((m) => (
            <MemberCard
              key={m._id}
              member={m}
              onRemove={async () => {
                await removeMember({ memberId: m._id });
                toast.success(`${m.name} removed from the circle`);
              }}
              onNotify={async (v) => {
                await setNotify({ memberId: m._id, notifyOnFlag: v });
              }}
            />
          ))}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-sky-300 bg-sky-50/60 p-4 text-sm leading-relaxed text-muted-foreground dark:border-sky-500/40 dark:bg-sky-500/10">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-sky-600" />
        <p>
          Circle alerts respect the same thresholds as your in-call banner —
          only <strong className="text-foreground">flagged</strong> calls (risk
          ≥ 70) trigger notifications. Nobody in your circle can read your
          transcripts unless you choose to share them.
        </p>
      </div>
    </div>
  );
}

function MemberCard({
  member,
  onRemove,
  onNotify,
}: {
  member: Doc<"trustedCircle">;
  onRemove: () => Promise<void>;
  onNotify: (v: boolean) => Promise<void>;
}) {
  const [notify, setNotify] = useState(member.notifyOnFlag);
  const [removing, setRemoving] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-[0_12px_32px_-24px_rgba(21,23,34,0.25)]">
      <div className="flex items-center gap-3">
        <Avatar className="size-11 border border-primary/30 bg-primary text-primary-foreground">
          <AvatarFallback className="bg-transparent">
            {member.name.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{member.name}</p>
          <p className="text-xs text-muted-foreground">
            {member.relation} ·{" "}
            <span className="font-mono">{member.phone}</span>
          </p>
          <p className="arch-label mt-0.5 text-sky-600">
            {relationHints(member.relation)} would hear the alert
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Remove ${member.name}`}
          disabled={removing}
          onClick={async () => {
            setRemoving(true);
            try {
              await onRemove();
            } finally {
              setRemoving(false);
            }
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-border/70 bg-muted/40 px-3 py-2">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <BellRing className="size-3.5" />
          Alert on flagged calls
        </span>
        <Switch
          checked={notify}
          onCheckedChange={(v) => {
            setNotify(v);
            void onNotify(v).catch(() => setNotify(!v));
          }}
        />
      </label>
    </div>
  );
}
