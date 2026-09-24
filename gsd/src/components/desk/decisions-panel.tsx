"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDecisions } from "@/lib/desk/decisions";
import { compact, type DecisionRow, type Stage } from "@/lib/desk/decision-log";
import { cn } from "@/lib/utils";

type Screen = Awaited<ReturnType<typeof getDecisions>>;

type Station = { stage: Stage; label: string; role: string; who: "règle" | "jev" | "exchange" };

const ENTRER: Station[] = [
  { stage: "J0", label: "Régime", role: "ouvrir de nouvelles positions ?", who: "règle" },
  { stage: "SIGNAL", label: "Signal", role: "Donchian 20 · Supertrend 10×3", who: "règle" },
  { stage: "FILTRE", label: "Limites", role: "une position, délai, clés", who: "règle" },
  { stage: "J1", label: "Famille", role: "convient-elle au régime ?", who: "règle" },
  { stage: "J2", label: "Avis Jev", role: "prendre ce signal ?", who: "jev" },
  { stage: "ORDRE", label: "Ordre", role: "exécuté et protégé ?", who: "exchange" },
];

const SORTIR: Station[] = [
  { stage: "GESTION", label: "Gestion", role: "tenir, réduire, couper", who: "règle" },
  { stage: "REVUE", label: "Revue Jev", role: "garder, réduire, couper ?", who: "jev" },
  { stage: "COUPE", label: "Filet", role: "perte au-delà de 1,5 R", who: "règle" },
];

const LABEL: Record<Stage, string> = Object.fromEntries(
  [...ENTRER, ...SORTIR].map((s) => [s.stage, s.label]),
) as Record<Stage, string>;

const BON = new Set(["oui", "passe", "prendre", "rempli", "tenir", "HOLD", "prendre 50 %", "renforcer"]);
const MAUVAIS = new Set(["non", "bloque", "refusé", "couper", "CUT", "échec", "erreur"]);
const PRUDENT = new Set(["écarté", "passer", "réduire", "TRIM"]);

function ton(answer: string) {
  if (answer === "LONG") return "text-long";
  if (answer === "SHORT") return "text-short";
  if (BON.has(answer)) return "text-ok";
  if (MAUVAIS.has(answer)) return "text-danger";
  if (PRUDENT.has(answer)) return "text-warn";
  return "text-foreground";
}

function usd(v: number, signed = false) {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const s = a >= 1 ? a.toFixed(2) : a >= 0.01 ? a.toFixed(3) : a.toFixed(5);
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  return `${sign}${s.replace(".", ",")} $`;
}

function quand(t: number, now: number) {
  const m = Math.round((now - t) / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

function horodatage(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Qui({ who, ombre }: { who: string; ombre?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        who === "jev" ? "border-accent/40 text-accent" : "border-border text-muted-foreground",
      )}
    >
      {who === "jev" ? (ombre ? "Jev · ombre" : "Jev") : who}
    </span>
  );
}

function Tuile({ k, v, n, tone }: { k: string; v: string; n?: string; tone?: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-elevated p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className={cn("tabular mt-1 text-lg font-medium", tone)}>{v}</p>
      {n && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{n}</p>}
    </div>
  );
}

function StationCard({ st, i, screen }: { st: Station; i: number; screen: Screen }) {
  const s = screen.summary.stages[st.stage];
  const top = Object.entries(s.answers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const last = s.last as DecisionRow | null;
  return (
    <article className="flex min-w-0 flex-col rounded-[var(--radius-md)] border border-border bg-elevated p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          <span className="tabular text-accent">{i}</span> · {st.label}
        </p>
        <Qui who={st.who} ombre={st.who === "jev"} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{st.role}</p>
      <p className="tabular mt-2 text-2xl font-medium">{s.total}</p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {top.length === 0 && <li className="text-muted-foreground">aucune décision</li>}
        {top.map(([a, n]) => (
          <li key={a} className="flex justify-between gap-2">
            <span className={ton(a)}>{a}</span>
            <span className="tabular text-muted-foreground">{n}</span>
          </li>
        ))}
      </ul>
      {last && (
        <p className="mt-2 truncate border-t border-border pt-2 text-[11px] text-muted-foreground" title={last.detail}>
          dernière : <span className={ton(last.answer)}>{last.answer}</span>
          {last.asset ? ` · ${last.asset}${last.tf ? ` ${last.tf}` : ""}` : ""} · {quand(last.t, screen.now)}
        </p>
      )}
    </article>
  );
}

function Voie({ titre, stations, depart, screen }: { titre: string; stations: Station[]; depart: number; screen: Screen }) {
  return (
    <div className="mt-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{titre}</p>
      <div className={cn("mt-2 grid gap-2", stations.length > 3 ? "sm:grid-cols-3 xl:grid-cols-6" : "sm:grid-cols-3")}>
        {stations.map((st, i) => (
          <StationCard key={st.stage} st={st} i={depart + i} screen={screen} />
        ))}
      </div>
    </div>
  );
}

const FILTRES: (Stage | "TOUT")[] = ["TOUT", "J0", "SIGNAL", "FILTRE", "J1", "J2", "ORDRE", "GESTION", "REVUE", "COUPE"];

export function DecisionsPanel() {
  const q = useQuery({
    queryKey: ["gsd-decisions"],
    queryFn: () => getDecisions({ data: {} }),
    refetchInterval: 15_000,
  });
  const [filtre, setFiltre] = useState<Stage | "TOUT">("TOUT");
  const screen = q.data;
  const rows = useMemo(
    () => (screen ? compact(screen.rows.filter((r) => filtre === "TOUT" || r.stage === filtre)).slice(0, 80) : []),
    [screen, filtre],
  );

  if (q.isError) {
    return (
      <section className="gsd-panel rounded-[var(--radius-lg)] p-4 lg:col-span-12">
        <p className="text-sm text-danger">Décisions : {(q.error as Error).message}</p>
      </section>
    );
  }
  if (!screen) {
    return (
      <section className="gsd-panel rounded-[var(--radius-lg)] p-4 lg:col-span-12">
        <p className="text-sm text-muted-foreground">Lecture des journaux…</p>
      </section>
    );
  }

  const st = screen.summary.stages;
  const ordres = st.ORDRE.answers;
  const avis = st.J2;
  const coutTotal = screen.spend.reduce((a, m) => a + m.usd, 0);
  const appels = screen.spend.reduce((a, m) => a + m.calls, 0);
  const acc = screen.account && !("error" in screen.account) ? screen.account : null;
  const mode = screen.pilot.kill ? "kill" : screen.pilot.autonome ? "autonome" : "manuel";

  return (
    <section className="gsd-panel min-w-0 rounded-[var(--radius-lg)] p-4 lg:col-span-12">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Chaque décision, telle qu'elle a été prise</p>
          <h2 className="text-lg font-medium">Décisions</h2>
        </div>
        <p className="text-[11px] text-muted-foreground">
          <span className={cn(mode === "autonome" ? "text-ok" : mode === "kill" ? "text-danger" : "text-warn")}>{mode}</span>
          {" · "}
          {screen.pilot.cycles} cycles
          {screen.pilot.lastAt ? ` · dernier ${quand(screen.pilot.lastAt, screen.now)}` : ""}
          {" · "}
          <span className={screen.keys.jev ? "text-ok" : "text-warn"}>{screen.keys.jev ? "clé Jev présente" : "clé Jev absente"}</span>
        </p>
      </div>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">
        Lu dans les journaux du bot et sur le compte Hyperliquid. Aucun chiffre n'est projeté : les coûts sont les sommes
        facturées, appel par appel. « Ombre » veut dire inscrit mais jamais appliqué au compte.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Tuile
          k="décisions inscrites"
          v={String(screen.summary.total)}
          n={screen.summary.since ? `depuis le ${horodatage(screen.summary.since)}` : "journal vide"}
        />
        <Tuile k="signaux" v={String(st.SIGNAL.total)} n={`${st.FILTRE.total} écartés avant J1`} />
        <Tuile
          k="ordres"
          v={`${ordres["rempli"] ?? 0} / ${st.ORDRE.total}`}
          n={`remplis · ${ordres["refusé"] ?? 0} refusés`}
          tone={(ordres["refusé"] ?? 0) > (ordres["rempli"] ?? 0) ? "text-danger" : undefined}
        />
        <Tuile
          k="avis Jev"
          v={String(avis.deciders["jev"] ?? 0)}
          n={`${avis.answers["prendre"] ?? 0} « prendre » · ${avis.deciders["local"] ?? 0} replis locaux`}
        />
        <Tuile k="coût réel de l'IA" v={usd(coutTotal)} n={`${appels} appels facturés, tous modèles`} />
        <Tuile
          k="résultat du compte"
          v={acc ? usd(acc.net, true) : "—"}
          n={acc ? `net de frais et financement depuis le ${horodatage(acc.since)}` : "clé Hyperliquid absente"}
          tone={acc ? (acc.net >= 0 ? "text-ok" : "text-danger") : undefined}
        />
      </div>

      <Voie titre="Entrer — de la règle à l'exchange" stations={ENTRER} depart={1} screen={screen} />
      <Voie titre="Tenir ou sortir — à chaque cycle, pour chaque position" stations={SORTIR} depart={7} screen={screen} />

      {screen.summary.total === 0 && (
        <p className="mt-3 rounded-[var(--radius-sm)] border border-border bg-elevated px-3 py-2 text-xs leading-snug text-muted-foreground">
          Aucune décision inscrite. Le journal commence avec cette version et se remplit à chaque cycle du pilote. En mode
          manuel, le pilote ne tourne pas : rien ne s'inscrit, et c'est normal.
        </p>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-12">
        <article className="min-w-0 rounded-[var(--radius-md)] border border-border bg-elevated p-3 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Journal des décisions</p>
            <div className="flex flex-wrap gap-1">
              {FILTRES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFiltre(f)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                    filtre === f ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-background",
                  )}
                >
                  {f === "TOUT" ? "tout" : LABEL[f]}
                </button>
              ))}
            </div>
          </div>
          <ul className="mt-2 max-h-[28rem] divide-y divide-border overflow-y-auto text-xs">
            {rows.length === 0 && <li className="py-2 text-muted-foreground">Rien pour ce filtre.</li>}
            {rows.map((r, i) => (
              <li key={`${r.t}-${i}`} className="py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="tabular text-muted-foreground">
                    {horodatage(r.t)}
                    {r.count > 1 ? ` · ×${r.count} depuis ${horodatage(r.tFirst).slice(6)}` : ""}
                  </span>
                  <span className="rounded-[var(--radius-xs)] bg-background px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                    {LABEL[r.stage]}
                  </span>
                  {r.asset && (
                    <span className="font-medium">
                      {r.asset}
                      {r.tf ? ` ${r.tf}` : ""}
                    </span>
                  )}
                  <span className={cn("font-medium", ton(r.answer))}>{r.answer}</span>
                  {r.p != null && <span className="tabular text-muted-foreground">p {r.p.toFixed(2)}</span>}
                  <Qui who={r.decider} ombre={!r.applied} />
                  {r.usd != null && r.usd > 0 && (
                    <span className="tabular text-muted-foreground">
                      {usd(r.usd)}
                      {r.ms != null ? ` · ${Math.round(r.ms)} ms` : ""}
                    </span>
                  )}
                </div>
                {r.detail && <p className="mt-0.5 break-words text-[11px] text-muted-foreground">{r.detail}</p>}
              </li>
            ))}
          </ul>
        </article>

        <div className="flex min-w-0 flex-col gap-3 lg:col-span-4">
          <article className="rounded-[var(--radius-md)] border border-border bg-elevated p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Ce que coûtent les décisions</p>
            {screen.spend.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Aucun appel facturé inscrit.</p>
            ) : (
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="font-normal">modèle</th>
                    <th className="text-right font-normal">appels</th>
                    <th className="text-right font-normal">total</th>
                    <th className="text-right font-normal">par appel</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {screen.spend.map((m) => (
                    <tr key={m.model}>
                      <td className="max-w-[8rem] truncate py-0.5 font-sans" title={m.model}>
                        {m.model}
                      </td>
                      <td className="text-right">{m.calls}</td>
                      <td className="text-right">{usd(m.usd)}</td>
                      <td className="text-right">{usd(m.usdPerCall)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Sommes facturées, inscrites à chaque appel. Les lignes Grok sont l'historique d'avant : le GSD ne l'appelle
              plus.
              {screen.summary.jev.msMedian != null ? ` Jev répond en ${Math.round(screen.summary.jev.msMedian)} ms (médiane).` : ""}
            </p>
          </article>

          <article className="rounded-[var(--radius-md)] border border-border bg-elevated p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Ce que le compte a fait</p>
            {!screen.account && <p className="mt-2 text-xs text-muted-foreground">Clé Hyperliquid absente.</p>}
            {screen.account && "error" in screen.account && (
              <p className="mt-2 text-xs text-danger">Hyperliquid : {screen.account.error}</p>
            )}
            {acc && (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">réalisé</dt>
                <dd className={cn("tabular text-right", acc.realized >= 0 ? "text-ok" : "text-danger")}>{usd(acc.realized, true)}</dd>
                <dt className="text-muted-foreground">frais</dt>
                <dd className="tabular text-right text-danger">{usd(-acc.fees)}</dd>
                <dt className="text-muted-foreground">financement</dt>
                <dd className={cn("tabular text-right", acc.funding >= 0 ? "text-ok" : "text-danger")}>{usd(acc.funding, true)}</dd>
                <dt className="font-medium">net</dt>
                <dd className={cn("tabular text-right font-medium", acc.net >= 0 ? "text-ok" : "text-danger")}>{usd(acc.net, true)}</dd>
                <dt className="text-muted-foreground">exécutions</dt>
                <dd className="tabular text-right">{acc.fills}</dd>
                <dt className="text-muted-foreground">clôtures gagnantes</dt>
                <dd className="tabular text-right">
                  {acc.wins} / {acc.closing}
                </dd>
                <dt className="text-muted-foreground">équité</dt>
                <dd className="tabular text-right">{acc.equity != null ? usd(acc.equity) : "—"}</dd>
              </dl>
            )}
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Toutes les exécutions du compte depuis le début du journal, y compris celles faites à la main.
            </p>
          </article>

          <article className="rounded-[var(--radius-md)] border border-border bg-elevated p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Avant ce journal</p>
            <p className="mt-2 text-xs">
              J1 : <span className="tabular">{screen.legacy.gate.total}</span> décisions ·{" "}
              <span className="text-ok">{screen.legacy.gate.pass} passe</span> ·{" "}
              <span className="text-danger">{screen.legacy.gate.block} bloque</span>
            </p>
            <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
              {Object.entries(screen.legacy.gate.reasons)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([k, n]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="truncate">{k}</span>
                    <span className="tabular">{n}</span>
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-xs">
              J2 : <span className="tabular">{screen.legacy.committee.total}</span> votes d'ombre ·{" "}
              {Object.entries(screen.legacy.committee.bySource)
                .map(([k, n]) => `${k} ${n}`)
                .join(" · ") || "aucun"}
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
