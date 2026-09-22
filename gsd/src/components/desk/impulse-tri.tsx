"use client";

export function dirFrom(now: number | null | undefined, prev: number | null | undefined): 1 | -1 | 0 {
  if (now == null || prev == null || !Number.isFinite(now) || !Number.isFinite(prev)) return 0;
  if (now > prev + 1e-8) return 1;
  if (now < prev - 1e-8) return -1;
  return 0;
}

export function ImpulseTri({ dir, pulse }: { dir: 1 | -1 | 0; pulse: string | number }) {
  if (!dir) return null;
  return (
    <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center overflow-visible">
      <span
        key={String(pulse) + String(dir)}
        className={dir > 0 ? "gsd-tri-up gsd-impulse" : "gsd-tri-dn gsd-impulse"}
        aria-hidden
      />
    </span>
  );
}
