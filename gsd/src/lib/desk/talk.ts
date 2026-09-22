import { createServerFn } from "@tanstack/react-start";

export const getTalk = createServerFn({ method: "POST" })
  .validator((input: Record<string, never> | undefined) => input ?? {})
  .handler(async () => {
    const m = await import("./talk.server");
    return m.readTalk();
  });
