#!/bin/bash
#
# Bootstrap Let's Encrypt pour api-game.nidalheim.com
# A lancer UNE FOIS sur le VPS depuis backend/infra/
# Les renouvellements suivants sont gérés automatiquement par le service certbot
# défini dans docker-compose.yml.
#
set -e

domains=(api-game.nidalheim.com)
rsa_key_size=4096
data_path="./certbot"
email="jean-jacques.delegue@epitech.eu"
staging=0  # mettre à 1 pour tester avec les certs de staging (no rate limit)

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

echo "### Démarrage de nginx avec le cert dummy..."
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
echo "    curl -I https://api-game.nidalheim.com"
