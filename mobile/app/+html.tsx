import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

import { brand } from '@/theme/brand';
import { c } from '@/theme/tokens';

/**
 * Coquille HTML de la build web.
 *
 * C'est ici que l'app devient installable depuis Safari : sans
 * `apple-mobile-web-app-capable`, « Sur l'écran d'accueil » crée un simple
 * marque-page qui rouvre Safari avec sa barre d'adresse.
 *
 * Ce fichier n'est utilisé que sur le web ; il n'est jamais rendu sur mobile
 * natif, et n'a donc pas accès au reste de l'app.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

        {/* `viewport-fit=cover` étend le fond sous l'encoche ; sans lui, une
            bande blanche apparaît en haut d'un iPhone en mode autonome. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />

        {/* --- Installation sur l'écran d'accueil --- */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* `black-translucent` laisse le fond encre passer derrière l'heure. */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={brand.shortName} />
        <meta name="application-name" content={brand.name} />
        <meta name="theme-color" content={c.ink} />
        <meta name="color-scheme" content="dark" />
        <meta name="description" content={brand.description} />

        <link rel="manifest" href="manifest.json" />
        <link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png" />
        <link rel="icon" href="favicon.ico" />

        {/* Désactive le défilement élastique du body : dans l'app, seules les
            zones de contenu défilent. */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: REGISTER_SW }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * Le fond est posé en CSS, pas seulement en React : entre le premier octet et
 * le premier rendu, un iPhone afficherait sinon un flash blanc — très visible
 * sur une app dont tout le design est un fond encre.
 */
const SHELL_CSS = `
  html, body, #root {
    background-color: ${c.ink};
    height: 100%;
  }
  body {
    margin: 0;
    overscroll-behavior-y: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-text-size-adjust: 100%;
  }
  /* Le tracé de l'Oracle ne doit jamais déclencher la sélection de texte. */
  #root { -webkit-user-select: none; user-select: none; }
`;

/**
 * Enregistrement du service worker.
 *
 * Volontairement inline et minimal : il doit tourner avant le bundle, pour que
 * la deuxième ouverture soit instantanée même sans réseau.
 *
 * Pas de `skipWaiting()` — le service worker du dashboard JCGI porte la trace
 * de cette leçon (commentaire #140) : activer de force à chaque installation
 * déclenche `controllerchange` → rechargement en boucle sur iOS.
 */
const REGISTER_SW = `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {
        /* Pas de service worker : l'app fonctionne, sans le mode hors-ligne. */
      });
    });
  }
`;
