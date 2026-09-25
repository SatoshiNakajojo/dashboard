import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canSubmit,
  canSwitchSide,
  canWithdraw,
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
    const call = {
      myVote: null,
      myVoteChanged: false,
      myVoteWithdrawn: false,
      votesOpen: true,
    };
    assert.deepEqual(myVoteStatus({ ...call, myVote: 'bear' }), {
      kind: 'vote',
      side: 'bear',
      changed: false,
      editable: true,
    });
    assert.deepEqual(myVoteStatus({ ...call, myVote: 'bull', votesOpen: false }), {
      kind: 'vote',
      side: 'bull',
      changed: false,
      editable: false,
    });
    assert.deepEqual(myVoteStatus({ ...call, myVoteWithdrawn: true }), { kind: 'withdrawn' });
    assert.equal(myVoteStatus(call), null);
  });
});

describe('un seul changement d’avis par call', () => {
  const CHANGED = { side: 'bear' as const, reason: 'Finalement non.', changed: true };

  it('laisse changer de camp une fois', () => {
    assert.equal(canSwitchSide(null), true);
    assert.equal(canSwitchSide(BULL), true);
    assert.equal(canSwitchSide(CHANGED), false);
    assert.equal(canSubmit(CHANGED, 'bull', 'Encore un revirement.'), false);
  });

  it('laisse toujours retoucher la phrase', () => {
    assert.equal(canSubmit(CHANGED, 'bear', 'Finalement non : la dette.'), true);
    assert.equal(submitLabel(CHANGED, 'bear'), 'METTRE À JOUR');
  });

  it('fait du retrait le changement, et le refuse après un changement', () => {
    assert.equal(canWithdraw(BULL), true);
    assert.equal(canWithdraw(CHANGED), false);
    assert.equal(canWithdraw(null), false);
  });
});
