"use client";

import { useQuery } from "@tanstack/react-query";
import { getSpend } from "@/lib/desk/spend";

function money(v: number) {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1) return v.toFixed(2) + " $";
  if (v >= 0.01) return v.toFixed(3) + " $";
  return v.toFixed(4) + " $";
}

export function SpendMeter() {
  const q = useQuery({
    queryKey: ["xai-spend"],
    queryFn: () => getSpend({ data: {} }),
    refetchInterval: 15_000,
  });
  const s = q.data;
  const rows = s
    ? [
        { k: "total", v: money(s.total) },
        { k: "60 s", v: money(s.perMin) },
        { k: "1 h", v: money(s.perHour) },
        { k: "24 h", v: money(s.perDay) },
        { k: "mois UTC", v: money(s.perMonth) },
      ]
    : [];
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-elevated p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Clé API xAI · ce département</p>
      <dl className="mt-2 grid grid-cols-5 gap-2 text-center">
        {rows.map((r) => (
          <div key={r.k}>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.k}</dt>
            <dd className="tabular mt-0.5 text-sm font-medium">{r.v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {s ? `${s.calls} appels 200 OK` : "en attente"} · somme facturée par xAI (ticks), pas un tarif projeté.
        0 $ sur 60 s = aucun appel dans la minute. Erreurs HTTP non comptées. Console xAI = référence.
      </p>
    </div>
  );
}
