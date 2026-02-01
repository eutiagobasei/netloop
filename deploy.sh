#!/bin/bash

# NetLoop Deploy Script
# Uso: ./deploy.sh [dev|prod]

ENV=$1

if [ -z "$ENV" ] || ([ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]); then
    echo "Uso: ./deploy.sh [dev|prod]"
    exit 1
fi

echo "=== Deploy NetLoop $ENV ==="

# Diretorio do projeto
PROJECT_DIR="/opt/netloop"

# Pull latest changes
cd $PROJECT_DIR
git pull origin main

# Build e deploy
if [ "$ENV" == "prod" ]; then
    echo ">>> Parando containers de producao..."
    docker compose -f docker-compose.prod.yml -p netloop-prod --env-file .env.prod down

    echo ">>> Buildando imagens de producao..."
    docker compose -f docker-compose.prod.yml -p netloop-prod --env-file .env.prod build --no-cache

    echo ">>> Iniciando containers de producao..."
    docker compose -f docker-compose.prod.yml -p netloop-prod --env-file .env.prod up -d

    echo ">>> Aguardando banco ficar pronto..."
    sleep 10

    echo ">>> Rodando migrations..."
    docker compose -f docker-compose.prod.yml -p netloop-prod --env-file .env.prod exec -T backend npx prisma migrate deploy
else
    echo ">>> Parando containers de desenvolvimento..."
    docker compose -f docker-compose.dev.yml -p netloop-dev --env-file .env.dev down

    echo ">>> Buildando imagens de desenvolvimento..."
    docker compose -f docker-compose.dev.yml -p netloop-dev --env-file .env.dev build --no-cache

    echo ">>> Iniciando containers de desenvolvimento..."
    docker compose -f docker-compose.dev.yml -p netloop-dev --env-file .env.dev up -d

    echo ">>> Aguardando banco ficar pronto..."
    sleep 10

    echo ">>> Rodando migrations..."
    docker compose -f docker-compose.dev.yml -p netloop-dev --env-file .env.dev exec -T backend npx prisma migrate deploy
fi

echo ""
echo "=== Deploy $ENV concluido! ==="
echo ""
echo "Containers rodando:"
docker ps | grep netloop-$ENV
echo ""

if [ "$ENV" == "prod" ]; then
    echo "URLs:"
    echo "  - Admin: http://IP_DA_VPS:3002"
    echo "  - API: http://IP_DA_VPS:3333"
else
    echo "URLs:"
    echo "  - Admin: http://IP_DA_VPS:3003"
    echo "  - API: http://IP_DA_VPS:3334"
fi
