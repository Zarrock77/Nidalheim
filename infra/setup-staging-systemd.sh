#!/bin/bash
#
# Setup systemd user units for the 4 staging host processes.
# A lancer UNE FOIS sur le VPS depuis infra/. Idempotent.
#
# Effets :
#   - active le lingering pour l'utilisateur (units survivent à la déco SSH)
#   - copie les units dans ~/.config/systemd/user/
#   - daemon-reload + enable + start des 4 services
#
# Logs : journalctl --user -u nidalheim-<service>-staging.service -f
#
set -e

cd "$(dirname "$0")"

if [ "$EUID" -eq 0 ]; then
  echo "Erreur: ne pas lancer en root, utiliser le user owner des process staging." >&2
  exit 1
fi

echo "### Activation du lingering pour $USER..."
sudo loginctl enable-linger "$USER"

echo "### Installation des units systemd user..."
mkdir -p "$HOME/.config/systemd/user"
cp systemd/nidalheim-*-staging.service "$HOME/.config/systemd/user/"

echo "### daemon-reload..."
systemctl --user daemon-reload

units=(
  nidalheim-api-auth-staging.service
  nidalheim-api-game-staging.service
  nidalheim-site-staging.service
  nidalheim-docs-staging.service
)

echo "### enable + start des units..."
systemctl --user enable "${units[@]}"
systemctl --user restart "${units[@]}"

sleep 3
echo
echo "### Statut :"
for u in "${units[@]}"; do
  printf "  %-45s %s\n" "$u" "$(systemctl --user is-active "$u")"
done

echo
echo "### Done. Suivre les logs :"
echo "    journalctl --user -u nidalheim-api-auth-staging.service -f"
echo "    journalctl --user -u nidalheim-api-game-staging.service -f"
echo "    journalctl --user -u nidalheim-site-staging.service -f"
echo "    journalctl --user -u nidalheim-docs-staging.service -f"
