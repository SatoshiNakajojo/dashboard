import { createServerFn } from "@tanstack/react-start";

export const accessStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const pilot = await import("./pilot.server");
    pilot.startPilot();
  } catch {
    /* ignore */
  }
  return { locked: Boolean(process.env.GSD_ACCESS_PIN) };
});

export const unlockAccess = createServerFn({ method: "POST" })
  .validator((input: { pin: string }) => input)
  .handler(async ({ data }) => {
    const expected = process.env.GSD_ACCESS_PIN;
    if (!expected) return { ok: true as const };
    return { ok: data.pin === expected };
  });
