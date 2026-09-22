"use client";

import { useState, type ReactNode } from "react";
import { Bot, GitBranch, Layers, LineChart, MessageSquare, Radar, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "pos", label: "Positions", Icon: Layers },
  { id: "radar", label: "Radar", Icon: Radar },
  { id: "nav", label: "NAV", Icon: LineChart },
  { id: "bot", label: "Bot", Icon: Bot },
  { id: "chaine", label: "Chaîne", Icon: GitBranch },
  { id: "journal", label: "Journal", Icon: MessageSquare },
  { id: "reglages", label: "Réglages", Icon: Settings },
] as const;

export function DeskTabs({ panes }: { panes: Record<(typeof TABS)[number]["id"], ReactNode> }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pos");
  return (
    <div className="lg:col-span-12">
      <nav className="sticky top-12 z-20 rounded-[var(--radius-md)] border border-border bg-elevated p-1">
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-7">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex h-12 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] text-xs font-medium",
                tab === t.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-background",
              )}
            >
              <t.Icon className="size-4 shrink-0" />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <div className="mt-3 grid gap-3 lg:grid-cols-12">
        {panes[tab] ?? (
          <p className="lg:col-span-12 text-sm text-danger">Onglet « {tab} » non branché — rebuild GSD-42.</p>
        )}
      </div>
    </div>
  );
}
