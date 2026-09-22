"use client";

export function ChartMarks({
  points,
  lo,
  hi,
}: {
  points: { i: number; n: number; y: number; kind: "open" | "close"; label: string }[];
  lo: number;
  hi: number;
}) {
  if (!(hi > lo) || !points.length) return null;
  const span = hi - lo;
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {points.map((p) => {
        const left = `calc(56px + (100% - 72px) * ${(p.i + 0.5) / Math.max(p.n, 1)})`;
        const top = `${((hi - p.y) / span) * 100}%`;
        const open = p.kind === "open";
        return (
          <div
            key={`${p.kind}-${p.i}-${p.label}`}
            className="absolute"
            style={{ left, top, transform: "translate(-50%, -50%)" }}
          >
            <div
              className={
                open
                  ? "size-4 rounded-full border-2 border-background bg-ok shadow-[0_0_0_3px_rgb(111_186_141_/_0.45)]"
                  : "size-4 rounded-full border-2 border-background bg-danger shadow-[0_0_0_3px_rgb(208_122_122_/_0.45)]"
              }
            />
            <span
              className={
                open
                  ? "absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap bg-background/90 px-1 text-[10px] font-medium uppercase tracking-wider text-ok"
                  : "absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap bg-background/90 px-1 text-[10px] font-medium uppercase tracking-wider text-danger"
              }
            >
              {p.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
