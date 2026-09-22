import { createServerFn } from "@tanstack/react-start";

export const getBook = createServerFn({ method: "POST" })
  .validator((input: Record<string, never> | undefined) => input ?? {})
  .handler(async () => {
    const m = await import("./book.server");
    try {
      const raw = process.env.HL_MASTER;
      if (raw) {
        const master = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
        const { readHlClosingFills } = await import("./hl");
        const fills = await readHlClosingFills(master);
        m.ingestFills(fills);
      }
    } catch {
      /* */
    }
    return m.readBook();
  });
