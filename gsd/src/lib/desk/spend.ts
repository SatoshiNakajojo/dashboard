import { createServerFn } from "@tanstack/react-start";

export const getSpend = createServerFn({ method: "POST" })
  .validator((input: Record<string, never> | undefined) => input ?? {})
  .handler(async () => {
    const m = await import("./spend.server");
    return m.spendSnapshot();
  });
