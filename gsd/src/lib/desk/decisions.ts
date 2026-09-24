import { createServerFn } from "@tanstack/react-start";

export const getDecisions = createServerFn({ method: "POST" })
  .validator((input: Record<string, never> | undefined) => input ?? {})
  .handler(async () => {
    const m = await import("./decisions.server");
    return m.readDecisionScreen();
  });
