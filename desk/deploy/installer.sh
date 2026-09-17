#!/usr/bin/env bash
#
# Installe ou met a jour tout ce que le VPS doit faire tourner.
#
#   curl -fsSL https://raw.githubusercontent.com/SatoshiNakajojo/dashboard/claude/trading-desk-p3-launch-e16cdi/desk/deploy/installer.sh | sudo bash
#
# ou, si le depot est deja la :
#
#   sudo bash /opt/desk/src/desk/deploy/installer.sh
#
# **Il est IDEMPOTENT.** On peut le relancer apres chaque changement de code :
# il met a jour le depot, reinstalle les unites systemd, et rend compte de
# l'etat de chacune. C'est la commande a taper quand quelque chose a bouge,
# et la seule.
#
# **Il ne fait tourner ni le desk ni aucune cle.** Le VPS n'heberge que la
# collecte : l'enregistreur de microstructure, le rituel hebdomadaire des
# deblocages, et l'inscription quotidienne des regles figees. Le desk lui-meme
# — qui lit les journaux et simule des ordres — tourne sur votre machine, pas
# ici. C'est pourquoi `requirements-enregistreur.txt` exclut FastAPI, uvicorn
# et le SDK Anthropic : installer le desk complet elargirait la surface
# d'attaque du VPS pour rien.

set -euo pipefail

DEPOT=/opt/desk/src
RACINE="$DEPOT/desk"
VENV=/opt/desk/.venv
BRANCHE=claude/trading-desk-p3-launch-e16cdi
UTILISATEUR=desk

bleu() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mok\033[0m    %s\n' "$*"; }
info() { printf '        %s\n' "$*"; }
rate() { printf '  \033[31mECHEC\033[0m %s\n' "$*"; }

# ── 0. Les conditions, verifiees AVANT de toucher a quoi que ce soit ───────
#
# Un installateur qui s'arrete au milieu laisse une machine dans un etat que
# personne ne sait decrire. On verifie donc tout d'abord.

[ "$(id -u)" -eq 0 ] || { rate "a lancer avec sudo"; exit 1; }
id "$UTILISATEUR" >/dev/null 2>&1 || {
    rate "l'utilisateur « $UTILISATEUR » n'existe pas."
    info "Premiere installation : suivre deploy/README.md, section Installation."
    exit 1
}
[ -d "$DEPOT/.git" ] || {
    rate "$DEPOT n'est pas un depot git."
    info "Premiere installation : suivre deploy/README.md, section Installation."
    exit 1
}
[ -x "$VENV/bin/python" ] || { rate "environnement Python absent : $VENV"; exit 1; }

bleu "1. Code"
# Un depot avec des modifications locales ne doit pas etre ecrase en silence :
# quelqu'un a peut-etre corrige quelque chose a la main, en urgence.
if ! sudo -u "$UTILISATEUR" git -C "$DEPOT" diff --quiet HEAD 2>/dev/null; then
    rate "modifications locales dans $DEPOT — rien n'a ete touche."
    info "Les voir :  sudo -u $UTILISATEUR git -C $DEPOT status"
    info "Les jeter : sudo -u $UTILISATEUR git -C $DEPOT checkout -- ."
    exit 1
fi
AVANT=$(sudo -u "$UTILISATEUR" git -C "$DEPOT" rev-parse --short HEAD)
sudo -u "$UTILISATEUR" git -C "$DEPOT" fetch --quiet origin "$BRANCHE"
sudo -u "$UTILISATEUR" git -C "$DEPOT" checkout --quiet "$BRANCHE"
sudo -u "$UTILISATEUR" git -C "$DEPOT" merge --quiet --ff-only "origin/$BRANCHE"
APRES=$(sudo -u "$UTILISATEUR" git -C "$DEPOT" rev-parse --short HEAD)
[ "$AVANT" = "$APRES" ] && ok "deja a jour ($APRES)" || ok "$AVANT → $APRES"

bleu "2. Dependances"
sudo -u "$UTILISATEUR" "$VENV/bin/pip" install --quiet --upgrade pip
sudo -u "$UTILISATEUR" "$VENV/bin/pip" install --quiet \
    -r "$RACINE/deploy/requirements-enregistreur.txt"
sudo -u "$UTILISATEUR" "$VENV/bin/pip" install --quiet -e "$RACINE" --no-deps
ok "a jour"

bleu "3. Dossiers de travail"
# `.cache` sert au telechargement de bougies du journal des regles ; `data`
# porte les deux journaux ; `baselines` recoit les artefacts de campagne, dont
# ceux de la ferme. Les unites systemd les declarent en ReadWritePaths, et un
# chemin declare qui n'existe pas fait echouer le demarrage — avec un message
# qui ne dit pas lequel.
for d in "$RACINE/data" "$RACINE/.cache" "$RACINE/baselines" \
         /var/lib/desk/enregistrement; do
    mkdir -p "$d"
    chown -R "$UTILISATEUR:$UTILISATEUR" "$d"
    ok "$d"
done

bleu "4. Unites systemd"
# `ferme.service` n'a PAS de timer, et ce n'est pas un oubli : un balayage
# ajoute des hypotheses au denominateur de son origine, donc c'est une
# decision, pas une routine. Il est installe mais jamais active — on le lance
# a la main par `systemctl start ferme`.
for u in enregistreur.service \
         rituel-deblocages.service rituel-deblocages.timer \
         regles-figees.service regles-figees.timer \
         regles-llm.service regles-llm.timer \
         ferme.service; do
    install -m 0644 "$RACINE/deploy/$u" "/etc/systemd/system/$u"
    ok "$u"
done
systemctl daemon-reload

bleu "5. Activation"
# Le service d'enregistrement tourne en continu ; les deux autres sont des
# oneshot declenches par leur timer. On active donc le service ET les timers,
# jamais les services oneshot eux-memes — les activer les lancerait a chaque
# demarrage, hors de leur cadence.
systemctl enable --now enregistreur >/dev/null 2>&1 && ok "enregistreur (continu)"
for t in rituel-deblocages.timer regles-figees.timer regles-llm.timer; do
    systemctl enable --now "$t" >/dev/null 2>&1 && ok "$t"
done

bleu "6. Etat"
printf '  %-28s %s\n' "enregistreur" "$(systemctl is-active enregistreur 2>&1)"
for t in rituel-deblocages.timer regles-figees.timer; do
    printf '  %-28s %s\n' "$t" "$(systemctl is-active "$t" 2>&1)"
done
echo
systemctl list-timers --no-pager rituel-deblocages.timer regles-figees.timer \
    regles-llm.timer 2>/dev/null \
    | sed 's/^/  /' || true

bleu "Et ensuite"
cat <<'FIN'
  Voir ce que chaque chose a fait :
    journalctl -u enregistreur      -n 30 --no-pager
    journalctl -u rituel-deblocages -n 40 --no-pager
    journalctl -u regles-figees     -n 40 --no-pager
    journalctl -u regles-llm        -n 40 --no-pager

  Forcer une execution sans attendre son echeance :
    sudo systemctl start rituel-deblocages.service
    sudo systemctl start regles-figees.service

  Un `oneshot` qui echoue RESTE en echec, deliberement : c'est ce qui rend la
  panne visible. `systemctl list-timers` dit la derniere execution et la
  prochaine — c'est le seul tableau de bord a regarder une fois par mois.
FIN
echo
