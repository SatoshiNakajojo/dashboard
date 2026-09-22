"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPilot, resumeRegime } from "@/lib/desk/pilot";
import { SpendMeter } from "@/components/desk/spend-meter";

const CALLS = [0, 2, 4, 6, 8, 12, 24];
const MINS = [5, 15, 30, 60, 120];

export function SettingsPanel({
  grokCallsPerHour,
  scanEveryMin,
  grokUsdPerDay,
  regime,
  onSaved,
}: {
  grokCallsPerHour: number;
  scanEveryMin: number;
  grokUsdPerDay?: number;
  regime?: {
    halted?: boolean;
    can_open_new_trade?: boolean;
    regime?: string;
    kill_reasons?: string[];
    day_pnl_pct?: number;
    loss_streak?: number;
  } | null;
  onSaved: () => void;
}) {
  const [calls, setCalls] = useState(grokCallsPerHour);
  const [mins, setMins] = useState(scanEveryMin);
  const [usd, setUsd] = useState(grokUsdPerDay ?? 1);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setCalls(grokCallsPerHour);
    setMins(scanEveryMin);
    if (grokUsdPerDay != null) setUsd(grokUsdPerDay);
  }, [grokCallsPerHour, scanEveryMin, grokUsdPerDay]);

  return (
    <section className="gsd-panel rounded-[var(--radius-lg)] p-4 lg:col-span-12">
      <div className="flex items-center gap-2">
        <Settings className="size-4 text-accent" />
        <h2 className="text-lg font-medium">Appels Grok</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Plafond par heure · fréquence des scans. 0 $ si 0 appel.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted-foreground">
          Appels / heure
          <select
            className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-border bg-secondary px-2 text-sm text-foreground"
            value={calls}
            onChange={(e) => setCalls(Number(e.target.value))}
          >
            {CALLS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "0 — gratuit" : `${n} / h`}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Un scan toutes les
          <select
            className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-border bg-secondary px-2 text-sm text-foreground"
            value={mins}
            onChange={(e) => setMins(Number(e.target.value))}
          >
            {MINS.map((n) => (
              <option key={n} value={n}>
                {n < 60 ? `${n} min` : `${n / 60} h`}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Plafond $ / jour (UTC)
          <select
            className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-border bg-secondary px-2 text-sm text-foreground"
            value={usd}
            onChange={(e) => setUsd(Number(e.target.value))}
          >
            {[0, 0.5, 1, 2, 5].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "0 $ — Grok off" : `${n} $ / jour`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button
        className="mt-4"
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMsg("");
          void setPilot({ data: { grokCallsPerHour: calls, scanEveryMin: mins, grokUsdPerDay: usd } })
            .then((res) => {
              const saved = res as { grokCallsPerHour?: number; scanEveryMin?: number };
              setMsg(
                saved?.grokCallsPerHour != null
                  ? `Enregistré · ${saved.grokCallsPerHour}/h · ${saved.scanEveryMin} min`
                  : `Envoyé · ${calls}/h · ${mins} min`,
              );
              onSaved();
            })
            .catch((e: unknown) => {
              setMsg(e instanceof Error ? e.message : "Échec enregistrement");
            })
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "…" : "Enregistrer"}
      </Button>
      {msg && <p className="mt-2 text-sm text-ok">{msg}</p>}
      <div className="mt-6 rounded-[var(--radius-md)] border border-border bg-elevated p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Gate régime J0</p>
        <p className="mt-1 text-sm">
          {regime?.can_open_new_trade === false
            ? `HALT · ${regime.regime ?? "?"} · ${(regime.kill_reasons || []).join(" · ") || "manuel"}`
            : `Ouvert · ${regime?.regime ?? "…"} · jour ${(((regime?.day_pnl_pct ?? 0) * 100).toFixed(2))}% · série ${regime?.loss_streak ?? 0}`}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Halt = plus de nouvel ordre. Positions ouvertes inchangées. Réarmement manuel.
        </p>
        {regime?.can_open_new_trade === false && (
          <Button
            className="mt-2"
            size="sm"
            variant="secondary"
            onClick={() => {
              void resumeRegime({ data: {} }).then(() => onSaved());
            }}
          >
            Réarmer la gate
          </Button>
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Alertes fill / kill / clé / DD : variables <span className="tabular">TELEGRAM_BOT_TOKEN</span> +{" "}
        <span className="tabular">TELEGRAM_CHAT_ID</span> ou <span className="tabular">NTFY_URL</span> dans le .env du
        VPS. Backup hors machine : <span className="tabular">BACKUP_URL</span> (POST JSON) — copie locale toutes les 6 h
        + Telegram/ntfy.
      </p>
      <SpendMeter />
    </section>
  );
}
