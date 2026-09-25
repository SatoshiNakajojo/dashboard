import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readSoundPreference, tapTarget, type NodeLike } from '@/lib/clickSound';

/** Un élément de DOM réduit à ce que lit `tapTarget`. */
function el(
  tagName: string,
  attributes: Record<string, string> = {},
  parentElement: NodeLike | null = null,
): NodeLike {
  return {
    tagName: tagName.toUpperCase(),
    parentElement,
    getAttribute: (name) => attributes[name] ?? null,
  };
}

describe('le clic au toucher', () => {
  it('clique sur ce qui se touche, même touché par un texte à l’intérieur', () => {
    const button = el('div', { role: 'button' });
    const label = el('div', { dir: 'auto' }, el('div', {}, button));
    assert.equal(tapTarget(label), button);
    for (const role of ['link', 'tab', 'radio', 'switch', 'checkbox']) {
      const node = el('div', { role });
      assert.equal(tapTarget(node), node, role);
    }
    const anchor = el('a', { href: '/member/x' });
    assert.equal(tapTarget(el('span', {}, anchor)), anchor);
  });

  it('se tait ailleurs : texte, champ, fond d’écran', () => {
    assert.equal(tapTarget(el('div', {}, el('div', {}, el('body')))), null);
    assert.equal(tapTarget(el('input', { type: 'text' })), null);
    assert.equal(tapTarget(null), null);
  });

  it('se tait sur un bouton désactivé', () => {
    assert.equal(tapTarget(el('div', { role: 'button', 'aria-disabled': 'true' })), null);
    assert.equal(tapTarget(el('button', { disabled: '' })), null);
    const live = el('div', { role: 'button', 'aria-disabled': 'false' });
    assert.equal(tapTarget(live), live);
  });

  it('se tait sous un data-snd="none"', () => {
    const quiet = el('div', { role: 'button', 'data-snd': 'none' });
    assert.equal(tapTarget(el('div', {}, quiet)), null);
  });

  it('est actif par défaut, coupé seulement par le membre', () => {
    assert.equal(readSoundPreference(null), true);
    assert.equal(readSoundPreference('1'), true);
    assert.equal(readSoundPreference('0'), false);
  });
});
