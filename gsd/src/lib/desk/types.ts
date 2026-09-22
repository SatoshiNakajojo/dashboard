export type Side = "LONG" | "SHORT";
export type Bias = "LONG" | "SHORT" | "FLAT";
export type Regime = "TREND_UP" | "TREND_DOWN" | "RANGE" | "UNKNOWN";

export type Stage =
  | "QUOTA"
  | "LECTURE"
  | "PAS_DE_SETUP"
  | "VETO"
  | "OBJECTION"
  | "CONVICTION"
  | "ASYMETRIE"
  | "STOP_HORS_LIMITES"
  | "REJET_CHEF"
  | "MANDAT"
  | "ORDRE"
  | "IDLE"
  | "RUNNING";

export interface Bar {
  asset: string;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketContext {
  actif: string;
  horodatage_ms: number;
  barres_analysees: number;
  prix: {
    dernier: number;
    ouverture_periode: number;
    variation_periode_pct: number;
    plus_haut_20: number | null;
    plus_bas_20: number | null;
    plus_haut_40: number | null;
    plus_bas_40: number | null;
    plus_haut_120: number | null;
    plus_bas_120: number | null;
  };
  indicateurs: {
    rsi_14: number | null;
    ema_20: number | null;
    ema_50: number | null;
    ema_20_au_dessus_50: boolean | null;
    atr_14: number | null;
    atr_pct_du_prix: number | null;
    volatilite_realisee_bps_24: number | null;
  };
  regime_code: { regime: Regime; confidence: number };
}

export interface AgentEnvelope {
  agent: string;
  abstained: boolean;
  abstain_reason: string | null;
  latency_ms: number;
  model_id: string;
  raw?: string;
}

export interface QuantRead extends AgentEnvelope {
  divergences: string[];
  momentum: number;
  stretch: number;
  liquidity_note: string;
}

export interface RegimeRead extends AgentEnvelope {
  regime: Regime;
  confidence: number;
  strategies_allowed: string[];
}

export interface AnalystView extends AgentEnvelope {
  asset: string;
  bias: Bias;
  key_levels: number[];
  thesis_summary: string;
  invalidation_summary: string;
}

export interface SetupProposal extends AgentEnvelope {
  asset: string;
  side: Side | null;
  entry_price: number | null;
  stop_price: number | null;
  target_price: number | null;
  horizon_hours: number;
  rationale: string;
  evaluation: string[];
}

export interface CounterThesis extends AgentEnvelope {
  objection: string;
  severity: number;
  veto: boolean;
}

export interface RiskAdvice extends AgentEnvelope {
  size_factor: number;
  reasons: string[];
}

export interface DeskVerdict extends AgentEnvelope {
  decision: "APPROVE" | "REDUCE" | "REJECT";
  size_factor: number;
  dissent_noted: string;
  rationale: string;
}

export interface ScoreNote {
  score: number;
  termes: { nom: string; valeur: number }[];
  omises: string[];
  explication: string;
}

export interface Mandate {
  mandate_id: string;
  issued_at_ms: number;
  ttl_ms: number;
  bias: Bias;
  conviction: number;
  universe: string[];
  max_notional_usd: number;
  max_leverage: number;
  size_factor: number;
  journal_ref: string;
}

export interface CycleResult {
  mandate: Mandate;
  stage: Stage;
  reason: string;
  context: MarketContext;
  bars: Bar[];
  regime: RegimeRead | null;
  quant: QuantRead | null;
  analyst: AnalystView | null;
  setup: SetupProposal | null;
  counter: CounterThesis | null;
  advice: RiskAdvice | null;
  verdict: DeskVerdict | null;
  note: ScoreNote | null;
  cost_calls: number;
  latency_ms: number;
}

export interface PaperPosition {
  id: string;
  asset: string;
  side: Side;
  entry: number;
  stop: number;
  target: number | null;
  notional: number;
  opened_at: number;
  mandate_id: string;
  status: "OPEN" | "STOPPED" | "TARGET" | "CLOSED";
  exit?: number;
  pnl?: number;
}

export interface JournalEntry {
  id: string;
  ts: number;
  kind: "cycle" | "mandate" | "fill" | "kill" | "note";
  text: string;
  stage?: Stage;
}

export const ASSETS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "SUIUSDT",
  "APTUSDT",
] as const;
export const INTERVALS = ["15m", "1h", "4h", "12h"] as const;

export const STAGE_LABEL: Record<Stage, string> = {
  IDLE: "En attente",
  RUNNING: "Briefing en cours",
  QUOTA: "Quota département",
  LECTURE: "Briefing desk",
  PAS_DE_SETUP: "Bot : pas de setup",
  VETO: "Veto avocat",
  OBJECTION: "Objection trop sévère",
  CONVICTION: "Score desk sous le seuil",
  ASYMETRIE: "Gain/risque insuffisant",
  STOP_HORS_LIMITES: "Stop hors bande desk",
  REJET_CHEF: "Rejet chef de desk",
  MANDAT: "Setup du bot",
  ORDRE: "Ordre passé par le département",
};
