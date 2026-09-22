/**
 * Liens publics d'un profil.
 *
 * Ce champ est le seul de l'app où un membre écrit du texte que six autres
 * verront **et** pourront toucher. Une entrée `javascript:` ouverte chez eux
 * exécuterait du code dans leur app : c'est le cas limite qui justifie tout ce
 * module.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_LABEL,
  MAX_LINKS,
  MAX_URL,
  linkKind,
  normalizeLinks,
  openableUrl,
  parseLinks,
  shortenUrl,
} from '@/lib/profileLinks';

describe('nature d’une entrée', () => {
  it('reconnaît une adresse web', () => {
    assert.equal(linkKind('https://github.com/jc'), 'web');
    assert.equal(linkKind('http://exemple.nc'), 'web');
    assert.equal(linkKind('github.com/jc'), 'web', 'sans schéma, c’est une faute de frappe');
    assert.equal(linkKind('satoshi.club'), 'web');
  });

  it('traite une adresse de portefeuille comme telle', () => {
    assert.equal(linkKind('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'), 'address');
    assert.equal(linkKind('0x742d35Cc6634C0532925a3b844Bc454e4438f44e'), 'address');
  });
});

describe('ce qu’on accepte d’ouvrir', () => {
  it('ouvre http et https', () => {
    assert.equal(openableUrl('https://github.com/jc'), 'https://github.com/jc');
    assert.equal(openableUrl('  http://exemple.nc  '), 'http://exemple.nc');
  });

  it('complète un domaine saisi sans schéma', () => {
    assert.equal(openableUrl('github.com/jc'), 'https://github.com/jc');
  });

  it('refuse tout ce qui pourrait exécuter quelque chose', () => {
    // Le cœur du module : ces entrées s'affichent, elles ne s'ouvrent jamais.
    for (const mauvais of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'vbscript:msgbox(1)',
      '  javascript:void(0)  ',
    ]) {
      assert.equal(openableUrl(mauvais), null, mauvais);
    }
  });

  it('ne rend pas ouvrable une adresse de portefeuille', () => {
    assert.equal(openableUrl('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'), null);
    assert.equal(openableUrl('0x742d35Cc6634C0532925a3b844Bc454e4438f44e'), null);
  });
});

describe('normalisation avant enregistrement', () => {
  it('retire les entrées sans adresse', () => {
    const rangé = normalizeLinks([
      { label: 'GitHub', url: 'https://github.com/jc' },
      { label: 'Vide', url: '   ' },
      { label: '', url: '' },
    ]);
    assert.deepEqual(rangé, [{ label: 'GitHub', url: 'https://github.com/jc' }]);
  });

  it('garde une adresse sans libellé, en la nommant', () => {
    // Une adresse de portefeuille collée sans nom reste utile ; l'inverse non.
    assert.deepEqual(normalizeLinks([{ label: '  ', url: 'bc1q…' }]), [
      { label: 'Lien', url: 'bc1q…' },
    ]);
  });

  it('déduplique sur l’adresse, pas sur le libellé', () => {
    const rangé = normalizeLinks([
      { label: 'GitHub', url: 'https://github.com/jc' },
      { label: 'Mon code', url: 'https://GITHUB.com/jc'.toLowerCase() },
    ]);
    assert.equal(rangé.length, 1);
  });

  it('coupe aux bornes de la base', () => {
    const rangé = normalizeLinks([{ label: 'x'.repeat(80), url: 'h'.repeat(400) }]);
    assert.equal(rangé[0]!.label.length, MAX_LABEL);
    assert.equal(rangé[0]!.url.length, MAX_URL);
  });

  it('plafonne le nombre d’entrées', () => {
    const beaucoup = Array.from({ length: 30 }, (_, i) => ({
      label: `L${i}`,
      url: `https://x${i}.nc`,
    }));
    assert.equal(normalizeLinks(beaucoup).length, MAX_LINKS);
  });

  it('ne lève jamais, quoi qu’on lui donne', () => {
    // Une saisie bancale se nettoie ; elle ne doit pas empêcher d'enregistrer
    // le reste du profil.
    assert.deepEqual(normalizeLinks([]), []);
    assert.deepEqual(normalizeLinks([null as never, undefined as never]), []);
    assert.deepEqual(normalizeLinks([{ label: undefined, url: undefined } as never]), []);
  });
});

describe('relecture depuis la base', () => {
  it('lit une liste bien formée', () => {
    assert.deepEqual(parseLinks([{ label: 'GitHub', url: 'https://github.com/jc' }]), [
      { label: 'GitHub', url: 'https://github.com/jc' },
    ]);
  });

  it('ne fait jamais confiance à la forme', () => {
    // La contrainte couvre ce que l'app écrit ; une ligne plus ancienne, ou
    // écrite depuis PostgREST, peut être n'importe quoi.
    assert.deepEqual(parseLinks(null), []);
    assert.deepEqual(parseLinks('github'), []);
    assert.deepEqual(parseLinks({ label: 'x', url: 'y' }), []);
    assert.deepEqual(parseLinks([1, 'deux', null, { url: 42 }]), []);
    assert.deepEqual(parseLinks([{ url: 'https://ok.nc' }]), [
      { label: 'Lien', url: 'https://ok.nc' },
    ]);
  });
});

describe('affichage raccourci', () => {
  it('laisse une adresse courte intacte', () => {
    assert.equal(shortenUrl('https://github.com/jc'), 'github.com/jc');
  });

  it('élide le milieu, jamais la fin', () => {
    // Sur une clé de portefeuille, les derniers caractères sont ceux qu'on
    // vérifie du regard avant d'envoyer des fonds.
    const clé = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    const court = shortenUrl(clé);
    assert.ok(court.length <= 28, court);
    assert.ok(court.includes('…'));
    assert.ok(court.startsWith('bc1qar'), court);
    assert.ok(clé.endsWith(court.slice(court.indexOf('…') + 1)), court);
  });
});
