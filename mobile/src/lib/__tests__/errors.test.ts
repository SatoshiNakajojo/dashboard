/**
 * Traduction des erreurs Supabase.
 *
 * Ce sont les seules phrases que verra un membre quand quelque chose coince.
 * Une chaîne anglaise qui passe au travers est un bug d'interface, pas un
 * détail — d'où ces cas, pris sur les messages réels de la plateforme.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeError } from '@/lib/errorMessages';

describe('erreurs d’authentification', () => {
  it('dit à un inconnu qu’il n’est pas sur la liste', () => {
    for (const message of [
      'Signups not allowed for otp',
      'Signup not allowed for this instance',
      'User not found',
    ]) {
      assert.equal(
        describeError({ message }),
        'Cette adresse n’est pas sur la liste du club.',
        message,
      );
    }
  });

  it('explique la limite d’envoi de courriels', () => {
    assert.equal(
      describeError({ message: 'Email rate limit exceeded' }),
      'Trop de codes demandés. Réessayez dans une heure.',
    );
  });

  it('explique l’attente entre deux demandes', () => {
    assert.equal(
      describeError({ message: 'For security purposes, you can only request this after 54 seconds.' }),
      'Un code vient d’être envoyé. Patientez quelques secondes.',
    );
  });

  it('distingue un code expiré d’un code faux — même message pour le membre', () => {
    assert.equal(describeError({ message: 'Token has expired or is invalid' }), 'Ce code est expiré ou incorrect.');
    assert.equal(describeError({ code: 'otp_expired', message: 'otp_expired' }), 'Ce code est expiré ou incorrect.');
  });
});

describe('erreurs de données', () => {
  it('traduit un refus de RLS', () => {
    assert.equal(
      describeError({ message: 'new row violates row-level security policy for table "tickers"' }),
      'Cette ligne ne vous appartient pas.',
    );
  });

  it('traduit une panne réseau', () => {
    for (const message of ['Failed to fetch', 'Network request failed', 'Load failed']) {
      assert.equal(describeError({ message }), 'Connexion indisponible.', message);
    }
  });
});

describe('cas limites', () => {
  it('ne casse pas sur une entrée inattendue', () => {
    assert.equal(describeError(null), 'Erreur inconnue');
    assert.equal(describeError(undefined), 'Erreur inconnue');
    assert.equal(describeError('une chaîne'), 'une chaîne');
    assert.equal(describeError(42), '42');
  });

  it('laisse passer un message non traduit plutôt que de le masquer', () => {
    // Mieux vaut une phrase anglaise qu'un « une erreur est survenue » qui
    // n'aide personne à diagnostiquer.
    assert.equal(describeError({ message: 'Quelque chose d’inédit' }), 'Quelque chose d’inédit');
  });
});
