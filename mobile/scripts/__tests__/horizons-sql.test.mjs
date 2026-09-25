/**
 * Les durées de pari, côté app et côté base, disent-elles la même chose ?
 *
 * Elles sont écrites deux fois, et c'est voulu : le calendrier d'un pari est une
 * frontière de sécurité, il doit vivre dans la base où le client ne peut pas le
 * réécrire, **et** l'app doit l'afficher. Mais deux copies divergent au premier
 * correctif qu'on n'applique qu'à l'une. Ce test lit la migration et la
 * compare au module TypeScript.
 *
 * Écrit en `.mjs` et non en `.ts` : il lit `horizons.ts` comme du texte plutôt
 * que de l'importer, pour ne dépendre d'aucun chargeur particulier.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// La dernière migration à redéfinir les horizons (v1.01 : 2 sem. et 1 mois
// arrivent, 5 et 10 ans sont retirés).
const SQL = readFileSync(
  path.join(ROOT, 'supabase/migrations/20261001090000_oracle_short_horizons.sql'),
  'utf8',
);
const TS = readFileSync(path.join(ROOT, 'src/lib/horizons.ts'), 'utf8');

/** `when '3m' then interval '90 days'` → { '3m': 90 } (en jours ou en heures). */
function sqlTable(functionName, unit) {
  const body = SQL.slice(SQL.indexOf(`function public.${functionName}(`));
  const end = body.indexOf('$$;');
  const out = {};
  for (const m of body.slice(0, end).matchAll(/when '(\w+)'\s+then interval '(\d+) (\w+)'/g)) {
    assert.equal(m[3], unit, `${functionName} : unité ${m[3]} inattendue pour ${m[1]}`);
    out[m[1]] = Number(m[2]);
  }
  return out;
}

/** `{ key: '1w', …, days: 7, editingHours: 24, … }` → { '1w': { days, editingHours, retired } }. */
function tsTable() {
  const out = {};
  for (const m of TS.matchAll(
    /\{\s*key:\s*'(\w+)'[^}]*?days:\s*([\d\s*]+?),\s*editingHours:\s*(\d+)[,\s][^}]*\}/g,
  )) {
    // `5 * 365` : on évalue le produit, rien d'autre.
    const days = m[2].split('*').reduce((acc, part) => acc * Number(part.trim()), 1);
    out[m[1]] = { days, editingHours: Number(m[3]), retired: /retired:\s*true/.test(m[0]) };
  }
  return out;
}

describe('les durées de pari, app et base', () => {
  const app = tsTable();
  const durées = sqlTable('horizon_duration', 'days');
  const fenêtres = sqlTable('horizon_editing', 'hours');

  it('connaissent les mêmes horizons', () => {
    assert.deepEqual(Object.keys(app).sort(), Object.keys(durées).sort());
    assert.deepEqual(Object.keys(app).sort(), Object.keys(fenêtres).sort());
    assert.equal(Object.keys(app).length, 8, 'six horizons ouverts et deux retirés');
  });

  it('donnent la même durée à chaque pari', () => {
    for (const [key, { days }] of Object.entries(app)) {
      assert.equal(
        durées[key],
        days,
        `${key} : ${days} j dans l'app, ${durées[key]} j en base`,
      );
    }
  });

  it('donnent la même fenêtre de révision', () => {
    // Si l'app affiche 24 h et que la base en accorde 72, le membre croit son
    // pari verrouillé alors qu'un autre peut encore redessiner le sien.
    for (const [key, { editingHours }] of Object.entries(app)) {
      assert.equal(fenêtres[key], editingHours, `${key} : fenêtre divergente`);
    }
  });

  it('acceptent en base exactement les horizons de l’app', () => {
    const check = SQL.match(/check \(horizon in \(([^)]+)\)\)/)[1];
    const autorisés = [...check.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(autorisés, Object.keys(app).sort());
  });

  it('n’ouvrent de pari que sur les mêmes horizons', () => {
    // L'app ne propose plus 5 et 10 ans ; la base doit les refuser aussi, sans
    // quoi un client ancien ou bricolé ouvrirait encore un pari à dix ans.
    const body = SQL.slice(SQL.indexOf('function public.horizon_open('));
    const list = body.match(/h in \(([^)]+)\)/)[1];
    const ouverts = [...list.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    const attendus = Object.entries(app)
      .filter(([, { retired }]) => !retired)
      .map(([key]) => key)
      .sort();
    assert.deepEqual(ouverts, attendus);
    assert.deepEqual(attendus, ['12m', '1m', '1w', '2w', '3m', '6m']);
  });
});
