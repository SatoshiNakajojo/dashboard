"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { getTalk } from "@/lib/desk/talk";

export function TalkPanel() {
  const q = useQuery({
    queryKey: ["bot-talk"],
    queryFn: () => getTalk({ data: {} }),
    refetchInterval: 15_000,
  });
  const lines = q.data ?? [];
  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4 lg:col-span-12">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-accent" />
        <h2 className="text-lg font-medium">Ce que dit le bot</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Chaque fois que Grok répond à un signal — du plus récent au plus ancien.
      </p>
      {lines.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Encore vide. Dès qu’un ticker déclenche un brief, la réplique s’affiche ici.
        </p>
      )}
      <ol className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
        {lines.map((ln, i) => (
          <li key={`${ln.t}-${i}`} className="rounded-[var(--radius-md)] border border-border bg-elevated p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {new Date(ln.t).toLocaleString("fr-FR")} · {ln.asset.replace("USDT", "")} {ln.interval}
              {ln.signal ? ` · ${ln.signal}` : ""}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{ln.bot || "—"}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
