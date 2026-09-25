import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canSubmit,
  initialReason,
  myVoteStatus,
  reasonAfterSwitch,
  submitLabel,
} from '@/features/bag/voteEdit';

const BULL = { side: 'bull' as const, reason: 'Le carnet de commandes double.' };

describe('changer d’avis', () => {
  it('ouvre la feuille sur la phrase du camp choisi, et seulement la sienne', () => {
    assert.equal(initialReason(BULL, 'bull'), BULL.reason);
    assert.equal(initialReason(BULL, 'bear'), '', 'une raison bull ne justifie pas un bear');
    assert.equal(initialReason(null, 'bear'), '');
  });

  it('efface la phrase d’origine en quittant son camp, et la rend en y revenant', () => {
    const cleared = reasonAfterSwitch(BULL, 'bull', 'bear', BULL.reason);
    assert.equal(cleared, '');
    assert.equal(reasonAfterSwitch(BULL, 'bear', 'bull', cleared), BULL.reason);
  });

  it('ne touche jamais à une phrase en cours d’écriture', () => {
    assert.equal(
      reasonAfterSwitch(BULL, 'bear', 'bull', 'Je me suis trompé'),
      'Je me suis trompé',
    );
    assert.equal(reasonAfterSwitch(BULL, 'bull', 'bear', 'Nouvelle idée'), 'Nouvelle idée');
    assert.equal(reasonAfterSwitch(null, 'bull', 'bear', 'Premier vote'), 'Premier vote');
  });

  it('nomme le geste', () => {
    assert.equal(submitLabel(null, 'bull'), 'VOTER BULL');
    assert.equal(submitLabel(BULL, 'bear'), 'PASSER BEAR');
    assert.equal(submitLabel(BULL, 'bull'), 'METTRE À JOUR');
  });

  it('n’envoie rien qui ne change rien', () => {
    assert.equal(canSubmit(BULL, 'bull', BULL.reason), false);
    assert.equal(canSubmit(BULL, 'bull', `${BULL.reason}  `), false);
    assert.equal(canSubmit(BULL, 'bull', 'Le carnet de commandes triple.'), true);
    assert.equal(canSubmit(BULL, 'bear', 'Valorisation délirante.'), true);
    assert.equal(canSubmit(BULL, 'bear', 'ok'), false, 'une phrase, même courte');
    assert.equal(canSubmit(null, 'bull', 'Propre.'), true);
  });

  it('dit sur la carte si le vote se modifie encore', () => {
    assert.deepEqual(myVoteStatus('bear', true), {
      label: 'VOTRE VOTE : BEAR',
      editable: true,
    });
    assert.deepEqual(myVoteStatus('bull', false), {
      label: 'VOTRE VOTE : BULL',
      editable: false,
    });
    assert.equal(myVoteStatus(null, true), null);
  });
});
