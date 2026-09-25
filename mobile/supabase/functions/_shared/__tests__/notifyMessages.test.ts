import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HORIZONS } from '@/lib/horizons';
import {
  CATEGORY_OF,
  HORIZON_PHRASES,
  composeMessage,
  nightWhen,
  percent,
  thousands,
  usd,
} from '../notifyMessages.ts';

const NBSP = ' ';
const none = { actorName: null, btcSpot: null };

describe('formats', () => {
  it('écrit à l’heure de Nouméa, quel que soit le fuseau du serveur', () => {
    // 3 octobre 2026, 8 h 30 UTC = 19 h 30 à Nouméa. Espaces insécables : la
    // date ne se coupe pas en fin de ligne.
    assert.equal(
      nightWhen('2026-10-03T08:30:00Z'),
      `sam.${NBSP}3${NBSP}oct.${NBSP}·${NBSP}19:30`,
    );
  });

  it('pourcentages, dollars et milliers à la française', () => {
    assert.equal(percent(50), `+50,0${NBSP}%`);
    assert.equal(percent(-12.34), `-12,3${NBSP}%`);
    assert.equal(usd(15.2), `15,2${NBSP}$`);
    assert.equal(usd(120911), `120${NBSP}911${NBSP}$`);
    assert.equal(thousands(164_400), `164${NBSP}k$`);
  });

  it('nomme les horizons comme l’app', () => {
    assert.deepEqual(Object.keys(HORIZON_PHRASES).sort(), HORIZONS.map((h) => h.key).sort());
    for (const h of HORIZONS) assert.equal(HORIZON_PHRASES[h.key], h.long.toLowerCase());
  });
});

describe('messages', () => {
  it('annonce une soirée, avec qui la propose', () => {
    const message = composeMessage(
      'night_new',
      {
        event_id: 'e1',
        title: 'Grillades & Halving Talk',
        location: 'Rooftop — Alex',
        starts_at: '2026-10-03T08:30:00Z',
        themes: ['Crypto Night', 'Stock Night'],
      },
      { actorName: 'Alex', btcSpot: null },
    )!;
    assert.equal(message.title, 'Nouvelle soirée · Crypto Night + Stock Night');
    assert.match(
      message.body,
      /^Grillades & Halving Talk — sam\..*19:30, Rooftop — Alex\. Proposée par Alex\.$/,
    );
    assert.equal(message.url, './');
    assert.equal(message.tag, 'night-e1');
  });

  it('rappelle la soirée du jour, et remplace l’annonce', () => {
    const message = composeMessage(
      'night_reminder',
      {
        event_id: 'e1',
        title: 'Pastaga',
        location: 'Chez Marco',
        starts_at: '2026-09-18T09:00:00Z',
        attendees: 1,
      },
      none,
    )!;
    assert.equal(message.title, 'Ce soir · Pastaga');
    assert.equal(message.body, '20:00, Chez Marco. 1 membre inscrit.');
    assert.equal(message.tag, 'night-e1');
  });

  it('annonce un call et sa clôture', () => {
    const call = composeMessage(
      'call_new',
      { ticker_id: 't1', symbol: '$SMR', thesis: 'Petits réacteurs.' },
      { actorName: 'John', btcSpot: null },
    )!;
    assert.deepEqual(call, {
      title: 'Nouveau call · $SMR',
      body: 'John : « Petits réacteurs. »',
      url: './bag',
      tag: 'call-t1',
    });

    const closed = composeMessage(
      'call_closed',
      { ticker_id: 't1', symbol: '$SMR', performance: '50.0000', exit_price: '15' },
      { actorName: 'John', btcSpot: null },
    )!;
    assert.equal(closed.title, `$SMR clôturé · +50,0${NBSP}%`);
    assert.equal(closed.body, `John sort à 15${NBSP}$. La perf est réalisée.`);
  });

  it('prévient qu’un pari est résolu, sans inventer ce qu’on ne sait pas', () => {
    const full = composeMessage(
      'oracle_resolved',
      { prediction_id: 'p1', horizon: '3m', target: 164_000 },
      { actorName: null, btcSpot: 131_200 },
    )!;
    assert.equal(full.title, 'Pari à trois mois résolu');
    assert.equal(
      full.body,
      `Votre courbe visait 164${NBSP}k$ ; le bitcoin est à 131${NBSP}k$. Votre justesse et votre rang vous attendent dans l’Oracle.`,
    );
    assert.equal(full.url, './oracle');

    const bare = composeMessage(
      'oracle_resolved',
      { prediction_id: 'p1', horizon: '1w', target: null },
      none,
    )!;
    assert.equal(bare.body, 'Votre justesse et votre rang vous attendent dans l’Oracle.');
  });

  it('coupe une thèse trop longue plutôt que de déborder', () => {
    const message = composeMessage(
      'call_new',
      { ticker_id: 't', symbol: '$X', thesis: 'a'.repeat(140) },
      none,
    )!;
    assert.ok(message.body.length < 140);
    assert.ok(message.body.includes('…'));
  });

  it('prévient d’une contre-proposition, avec sa raison', () => {
    const message = composeMessage(
      'night_proposal',
      {
        proposal_id: 'p1',
        event_id: 'e1',
        title: 'Grillades',
        current: 'Chez John',
        location: 'Chez Alex — Anse Vata',
        comment: 'Je garde mes enfants : on peut le faire chez moi ?',
        starts_at: '2026-10-03T08:30:00Z',
      },
      { actorName: 'Alex', btcSpot: null },
    )!;
    assert.equal(message.title, 'Autre lieu proposé · Grillades');
    assert.equal(
      message.body,
      'Alex propose Chez Alex — Anse Vata au lieu de Chez John : « Je garde mes enfants : on peut le faire chez moi ? » Les participants votent.',
    );
    assert.equal(message.tag, 'proposal-p1');
  });

  it('annonce un changement de lieu, à la place de l’annonce de la soirée', () => {
    const message = composeMessage(
      'night_moved',
      {
        event_id: 'e1',
        title: 'Grillades',
        location: 'Chez Alex — Anse Vata',
        starts_at: '2026-10-03T08:30:00Z',
      },
      none,
    )!;
    assert.equal(message.title, 'Grillades change de lieu');
    assert.match(message.body, /^Désormais : Chez Alex — Anse Vata — sam\..*19:30\. Décidé/);
    assert.equal(message.tag, 'night-e1');
  });

  it('n’envoie rien sur une charge inexploitable', () => {
    assert.equal(composeMessage('night_new', {}, none), null);
    assert.equal(composeMessage('night_proposal', { title: 'Grillades' }, none), null);
    assert.equal(composeMessage('night_moved', { location: 'Ici' }, none), null);
    assert.equal(composeMessage('oracle_resolved', { horizon: '2y' }, none), null);
  });

  it('range chaque événement dans un réglage', () => {
    assert.deepEqual(
      new Set(Object.values(CATEGORY_OF)),
      new Set(['nights', 'reminders', 'calls', 'oracle']),
    );
  });
});
