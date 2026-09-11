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
