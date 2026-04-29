#!/bin/bash
#
# Bootstrap Let's Encrypt pour api-game-staging.nidalheim.com
# Même logique que init-letsencrypt.sh mais pour le domaine de staging.
# A lancer UNE FOIS sur le VPS depuis infra/. Renouvellements gérés par
# le service certbot du compose.
#
# Pré-requis :
#   - DNS-only (gris) sur Cloudflare pour api-game-staging.nidalheim.com
#   - record A pointant sur l'IP du VPS
#   - nginx.conf doit déjà contenir les server blocks pour ce domaine
#
set -e

domains=(api-game-staging.nidalheim.com)
rsa_key_size=4096
data_path="./certbot"
email="jean-jacques.delegue@epitech.eu"
staging=0

if ! [ -x "$(command -v docker)" ]; then
  echo "Erreur: docker n'est pas installé." >&2
  exit 1
fi

if [ -d "$data_path/conf/live/${domains[0]}" ]; then
  read -p "Cert existant pour ${domains[0]}. Continuer et le remplacer ? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    exit
  fi
fi

if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ] || [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
  echo "### Téléchargement des paramètres TLS recommandés..."
  mkdir -p "$data_path/conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"
fi

echo "### Création d'un cert dummy temporaire pour ${domains[0]}..."
path="/etc/letsencrypt/live/${domains[0]}"
mkdir -p "$data_path/conf/live/${domains[0]}"
docker compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1 \
    -keyout '$path/privkey.pem' \
    -out '$path/fullchain.pem' \
    -subj '/CN=localhost'" certbot

echo "### Recreation de nginx avec extra_hosts + cert dummy..."
docker compose up --force-recreate -d nginx

echo "### Suppression du cert dummy..."
docker compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/${domains[0]} && \
  rm -Rf /etc/letsencrypt/archive/${domains[0]} && \
  rm -Rf /etc/letsencrypt/renewal/${domains[0]}.conf" certbot

echo "### Demande du vrai cert Let's Encrypt pour ${domains[0]}..."
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

email_arg="--email $email"
[ -z "$email" ] && email_arg="--register-unsafely-without-email"

staging_arg=""
[ $staging != "0" ] && staging_arg="--staging"

docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --no-eff-email \
    --force-renewal" certbot

echo "### Reload nginx avec le vrai cert..."
docker compose exec nginx nginx -s reload

echo
echo "### Done. Test:"
echo "    curl -I https://api-game-staging.nidalheim.com"
