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
  const video = document.getElementById("film");
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

  /* Retirer la séquence. Le poste est déjà dessous, déjà peint. */
  function arriver() {
    if (sequence.hidden) return;
    sequence.hidden = true;
    passer.hidden = true;
    video.pause();
    retenir();
  }

  function embarquer() {
    if (accueil.hidden || accueil.classList.contains("part")) return;
    accueil.classList.add("part");
    setTimeout(() => { accueil.hidden = true; }, 460);

    sequence.hidden = false;
    passer.hidden = false;

    const lecture = video.play();
    if (lecture && typeof lecture.catch === "function") {
      // Codec absent, onglet en arrière-plan, politique d'autoplay : on ne
      // laisse personne devant un rectangle noir. Le poste est dessous.
      lecture.catch(arriver);
    }
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
  const revoir = document.getElementById("revoir");
  if (revoir) {
    revoir.addEventListener("click", () => {
      try { sessionStorage.removeItem(MEMOIRE); } catch (_) { /* privee */ }
      accueil.hidden = false;
      // Deux images de battement avant de retirer `part`, sinon le
      // navigateur peut grouper « afficher » et « rendre opaque » dans le
      // meme rendu : la transition n'aurait alors pas lieu.
      requestAnimationFrame(() => requestAnimationFrame(
        () => accueil.classList.remove("part")));
    });
  }

  accueil.addEventListener("click", embarquer);
  accueil.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); embarquer(); }
  });

  video.addEventListener("ended", arriver);
  video.addEventListener("error", arriver);
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
  const verre = document.querySelector(".verre");
  if (verre) {
    const assombrir = () => {
      try {
        verre.contentDocument.documentElement.setAttribute("data-theme", "dark");
      } catch (_) { /* document pas encore lisible : sans conséquence */ }
    };
    verre.addEventListener("load", assombrir);
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
