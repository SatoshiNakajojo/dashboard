import { createServerFn } from "@tanstack/react-start";

export const getChain = createServerFn({ method: "POST" })
  .validator((input: Record<string, never> | undefined) => input ?? {})
  .handler(async () => {
    const m = await import("./chain.server");
    return m.readChain();
  });
