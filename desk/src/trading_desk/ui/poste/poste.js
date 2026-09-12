/* L'embarquement : accueil, séquence, poste.
 *
 * LE POSTE EST MONTÉ DÈS LE DÉPART, sous les deux autres couches. On ne le
 * révèle pas à la fin de la séquence — on retire ce qui le couvrait.
 *
 * Ce n'est pas un détail de mise en œuvre, c'est ce qui rend le raccord
 * possible. La première version montait le poste au moment de la bascule et
 * devait ordonner deux images de battement pour qu'il soit peint avant que
 * la vidéo ne parte ; toute panne de cet ordonnancement laissait un écran
 * noir, et c'est exactement ce qui est arrivé quand le navigateur a refusé
 * le codec. Un décor déjà là ne peut pas manquer son entrée.
 *
 * Effet de bord recherché : l'iframe des panneaux se charge pendant
 * l'accueil et la séquence. On arrive au poste sur un écran déjà vivant,
 * pas sur un écran qui commence à se remplir.
 */
(function () {
  "use strict";

  /* Le décor a besoin d'une pièce.
   *
   * La dalle occupe 48,8 % de la largeur du décor, et le décor est une
   * image 16/9 contenue dans la fenêtre. Sur un téléphone en portrait, ça
   * fait un verre de 190 px sur 149 : le desk y est illisible, et le décor
   * ne décore plus rien. Mesuré, pas supposé — 390×844 donne 190×149,
   * 1024×768 donne 500×391.
   *
   * En dessous du seuil on rend donc les panneaux nus, qui eux savent
   * s'afficher partout. `replace` et non `href` : le bouton « retour » doit
   * ramener d'où l'on vient, pas rejouer la redirection.
   *
   * LE SEUIL EST ÉCRIT DEUX FOIS — ici et dans `desk.css`, qui masque le
   * lien « poste » exactement en dessous. Sans cet accord, le lien mènerait
   * à une page qui renvoie aussitôt sur celle qu'on vient de quitter : un
   * clic sans effet, la pire des réponses. Le test
   * `test_le_seuil_du_decor_est_le_meme_des_deux_cotes` les compare.
   */
  const LARGEUR_MINIMALE_DU_DECOR = 1100;

  function laPieceEstTropPetite() {
    return Math.min(innerWidth, innerHeight * 16 / 9) < LARGEUR_MINIMALE_DU_DECOR;
  }

  if (laPieceEstTropPetite()) {
    location.replace("/panneaux");
    return;
  }

  const accueil = document.getElementById("embarquement");
  const sequence = document.getElementById("sequence");
  const film = document.getElementById("film");
  const passer = document.getElementById("passer");

  const MEMOIRE = "embarque";

  function retenir() {
    // `sessionStorage` et non `localStorage` : rouvrir le desk demain doit
    // redonner la séquence — c'est elle qui fait qu'on s'assoit quelque
    // part. Dans l'onglet courant, en revanche, une séquence de trois
    // secondes est agréable une fois et pénible à la vingtième, et le desk
    // se recharge souvent.
    try { sessionStorage.setItem(MEMOIRE, "1"); } catch (_) { /* navigation privée */ }
  }

  /* ------------------------------------------------------------------
     Les transitions.

     Quatre séquences, un seul lecteur. Chacune part d'un décor et arrive
     sur un autre ; les deux images de raccord sont EXTRAITES des vidéos
     elles-mêmes, donc les jonctions sont exactes par construction —
     mesuré à 0,00 % d'écart sur les quatre extrémités.

     `depuis` et `vers` ne servent pas à jouer la vidéo : ils disent quelle
     couche doit être visible AVANT et APRÈS. C'est ce qui permet de ne
     jamais révéler un décor qui n'est pas encore peint.
     ------------------------------------------------------------------ */
  const TRANSITIONS = {
    embarquement: { fichier: "embarquement", vers: "poste" },
    retour:       { fichier: "retour",       vers: "accueil" },
    versGauche:   { fichier: "vers_gauche",  vers: "gauche" },
    versPfd:      { fichier: "vers_pfd",     vers: "poste" },
  };

  const poste = document.getElementById("poste");
  const gauche = document.getElementById("gauche");
  const retourPfd = document.getElementById("retourPfd");
  const revoirBtn = document.getElementById("revoir");

  /* Le codec est déclaré EN ENTIER, pas seulement le conteneur : un
     navigateur qui lit « video/mp4 » se croit capable et télécharge trois
     mégaoctets avant de découvrir qu'il n'a pas H.264. Avec le profil et le
     niveau, il saute le fichier sans rien demander. */
  function poserSources(fichier) {
    film.innerHTML = "";
    const ajouter = (ext, type) => {
      const src = document.createElement("source");
      src.src = "/ui/poste/assets/" + fichier + "." + ext;
      src.type = type;
      film.appendChild(src);
    };
    ajouter("mp4", 'video/mp4; codecs="avc1.64001f, mp4a.40.2"');
    ajouter("webm", 'video/webm; codecs="vp9, opus"');
    film.load();
  }

  /* Quelle station montrer. Une seule est visible à la fois, et le passage
     se fait par `hidden` — jamais par un retrait du DOM, pour que l'iframe
     des panneaux garde son état et son flux SSE d'un aller-retour à
     l'autre. Revenir sur un écran qui recommence à se charger donnerait
     l'impression d'avoir quitté l'application. */
  function montrer(station) {
    poste.hidden = station !== "poste";
    gauche.hidden = station !== "gauche";
    retourPfd.hidden = station !== "gauche";
    if (revoirBtn) revoirBtn.hidden = station !== "poste";
  }

  let destination = "poste";

  function jouer(nom) {
    const t = TRANSITIONS[nom];
    if (!t || !sequence.hidden) return;      // jamais deux à la fois
    destination = t.vers;
    // La station d'arrivée est montée SOUS la séquence, avant qu'elle ne
    // parte : quand la vidéo se retire, le décor est déjà là.
    if (t.vers !== "accueil") montrer(t.vers);
    poserSources(t.fichier);
    sequence.hidden = false;
    passer.hidden = false;
    const lecture = film.play();
    if (lecture && typeof lecture.catch === "function") lecture.catch(arriver);
  }

  /* Retirer la séquence. Le poste est déjà dessous, déjà peint. */
  function arriver() {
    if (sequence.hidden) return;
    sequence.hidden = true;
    passer.hidden = true;
    film.pause();
    if (destination === "accueil") {
      montrer(null);
      accueil.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(
        () => accueil.classList.remove("part")));
    } else {
      montrer(destination);
      retenir();
    }
  }

  function embarquer() {
    if (accueil.hidden || accueil.classList.contains("part")) return;
    accueil.classList.add("part");
    setTimeout(() => { accueil.hidden = true; }, 460);
    // Codec absent, onglet en arrière-plan, politique d'autoplay : `jouer`
    // retombe sur `arriver`, donc on ne laisse personne devant un rectangle
    // noir. La station d'arrivée est montée avant que la vidéo ne parte.
    jouer("embarquement");
  }

  /* Revenir a la vue d'ensemble.
   *
   * On ne recharge pas la page et on ne rejoue pas la sequence : on remet
   * simplement l'accueil par-dessus. Le poste reste monte dessous, l'iframe
   * garde son etat, et repartir est instantane — c'est le meme principe que
   * l'arrivee, en sens inverse.
   *
   * La memoire de session est effacee : on vient de redemander la vue du
   * debut, donc le clic suivant doit rejouer la sequence entiere. La
   * conserver ferait passer directement au poste, ce qui donnerait un
   * bouton qui semble ne rien faire.
   */
  if (revoirBtn) {
    revoirBtn.addEventListener("click", () => {
      // La mémoire est effacée AVANT de jouer : on vient de redemander la
      // vue du début, donc le clic suivant doit rejouer l'embarquement
      // entier. La conserver ferait passer directement au poste, et le
      // bouton semblerait ne rien faire.
      try { sessionStorage.removeItem(MEMOIRE); } catch (_) { /* privee */ }
      jouer("retour");
    });
  }

  /* Le retour depuis l'écran de gauche. */
  if (retourPfd) retourPfd.addEventListener("click", () => jouer("versPfd"));

  /* L'ALLER SE DÉCLENCHE DEPUIS LE PFD, DANS L'IFRAME.
   *
   * Le titre « Flux de données » vit dans `/panneaux`, qui est une autre
   * page — on ne peut pas lui accrocher un écouteur d'ici. Les panneaux
   * émettent donc un message, et le poste l'écoute. C'est volontairement
   * la seule chose que les panneaux savent du décor : ils publient un
   * événement, ils n'appellent pas le poste. Les panneaux restent
   * utilisables seuls, sans rien connaître de la mise en scène.
   *
   * L'origine est vérifiée : ce port n'écoute que sur 127.0.0.1, mais une
   * page ouverte dans un autre onglet peut poster vers celui-ci, et un
   * message étranger ne doit pas pouvoir piloter le poste.
   */
  addEventListener("message", (e) => {
    if (e.origin !== location.origin) return;
    const d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.desk === "voir-flux") jouer("versGauche");
  });

  accueil.addEventListener("click", embarquer);
  accueil.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); embarquer(); }
  });

  film.addEventListener("ended", arriver);
  film.addEventListener("error", arriver);
  passer.addEventListener("click", arriver);
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sequence.hidden) arriver();
  });

  /* Les panneaux sont TOUJOURS sombres dans le verre.
   *
   * Ce n'est pas une préférence, c'est une propriété du décor : un panneau
   * blanc au milieu d'un poste sombre, et l'illusion tombe d'un coup — on
   * ne voit plus un écran encastré, on voit une page web posée sur une
   * photo. La vue sans décor, elle, garde le choix de l'utilisateur.
   *
   * Posé au chargement de l'iframe, donc après `desk.js` qui restaure la
   * préférence : c'est nous qui devons gagner. Personne ne voit de
   * clignotement, parce que l'iframe se charge derrière l'accueil.
   */
  // LES DEUX DALLES, pas seulement celle du PFD. L'écran de gauche
  // s'affichait en clair au premier essai — une page blanche au milieu d'un
  // poste sombre, et l'illusion tombe d'un coup.
  for (const dalle of document.querySelectorAll(".verre, .verre-gauche")) {
    const assombrir = () => {
      try {
        dalle.contentDocument.documentElement.setAttribute("data-theme", "dark");
      } catch (_) { /* document pas encore lisible : sans conséquence */ }
    };
    dalle.addEventListener("load", assombrir);
    assombrir();
  }

  let deja = false;
  try { deja = sessionStorage.getItem(MEMOIRE) === "1"; } catch (_) { /* privée */ }
  if (deja) {
    accueil.hidden = true;
    sequence.hidden = true;
    passer.hidden = true;
  }
})();
