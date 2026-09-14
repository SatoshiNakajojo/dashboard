/**
 * Crochet de résolution pour le lanceur de tests de Node.
 *
 * Metro comprend `@/x` et les imports sans extension ; Node non. Ce crochet
 * comble l'écart pour que les tests puissent charger n'importe quel module de
 * `src/` — fixtures comprises — sans dupliquer les données.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/** Ajoute `.ts` / `/index.ts` à un chemin sans extension. */
function withExtension(absolute) {
  if (existsSync(absolute) && path.extname(absolute)) return absolute;
  for (const candidate of [`${absolute}.ts`, `${absolute}.tsx`, path.join(absolute, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return absolute;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return { url: pathToFileURL(withExtension(path.join(SRC, specifier.slice(2)))).href, shortCircuit: true };
  }

  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const absolute = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    const resolved = withExtension(absolute);
    if (resolved !== absolute) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
