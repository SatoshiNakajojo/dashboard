"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Radar } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { accessStatus, unlockAccess } from "@/lib/desk/access";

const FLAG = "gsd-unlocked";

export function AccessGate({ children }: { children: React.ReactNode }) {
  const status = useQuery({ queryKey: ["gsd-access"], queryFn: () => accessStatus() });
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(() =>
    typeof window === "undefined" ? false : window.localStorage.getItem(FLAG) === "1",
  );

  if (status.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (!status.data?.locked || open) return <>{children}</>;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <form
        className="w-full max-w-sm rounded-[var(--radius-xl)] border border-border bg-card p-6"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          void unlockAccess({ data: { pin } }).then((r) => {
            setBusy(false);
            if (!r.ok) {
              setErr("Code refusé");
              return;
            }
            window.localStorage.setItem(FLAG, "1");
            setOpen(true);
          });
        }}
      >
        <div className="mb-4 flex items-center gap-2">
          <Radar className="size-5 text-accent" />
          <h1 className="text-lg font-medium">Grok Strategy Department</h1>
        </div>
        <p className="text-sm text-muted-foreground">Accès privé — toi seul.</p>
        <input
          type="password"
          autoComplete="current-password"
          className="mt-4 h-12 w-full rounded-[var(--radius-sm)] border border-border bg-secondary px-3 text-base"
          placeholder="Code d’accès"
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="go"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
        <Button type="submit" className="mt-4 w-full" disabled={busy || !pin}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Entrer
        </Button>
      </form>
    </div>
  );
}
