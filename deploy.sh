#!/bin/bash

# NetLoop Deploy Script
# Uso: ./deploy.sh [dev|prod]

set -e  # Exit on error

ENV=$1

if [ -z "$ENV" ] || ([ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]); then
    echo "Uso: ./deploy.sh [dev|prod]"
    exit 1
fi

echo "=== Deploy NetLoop $ENV ==="

# Diretorio do projeto
PROJECT_DIR="/opt/netloop"
BACKUP_DIR="$PROJECT_DIR/backups"

# Criar diretorio de backups se nao existir
mkdir -p $BACKUP_DIR

# Pull latest changes
cd $PROJECT_DIR
git pull origin main

# Funcao para criar backup do banco
create_backup() {
    local COMPOSE_FILE=$1
    local PROJECT_NAME=$2
    local ENV_FILE=$3
    local BACKUP_FILE="$BACKUP_DIR/backup_${ENV}_$(date +%Y%m%d_%H%M%S).sql"

    echo ">>> Criando backup do banco de dados..."

    # Verificar se container postgres esta rodando
    if docker compose -f $COMPOSE_FILE -p $PROJECT_NAME --env-file $ENV_FILE ps postgres 2>/dev/null | grep -q "running"; then
        # Carregar variaveis de ambiente
        source $ENV_FILE

        # Criar backup
        docker compose -f $COMPOSE_FILE -p $PROJECT_NAME --env-file $ENV_FILE exec -T postgres \
            pg_dump -U $DB_USER -d $DB_NAME > "$BACKUP_FILE" 2>/dev/null

        # Verificar se backup foi criado com sucesso
        if [ -s "$BACKUP_FILE" ]; then
            echo ">>> Backup criado com sucesso: $BACKUP_FILE"
            echo ">>> Tamanho do backup: $(du -h "$BACKUP_FILE" | cut -f1)"

            # Manter apenas os ultimos 10 backups
            ls -t $BACKUP_DIR/backup_${ENV}_*.sql 2>/dev/null | tail -n +11 | xargs -r rm -f
            echo ">>> Backups antigos removidos (mantendo ultimos 10)"
        else
            echo "AVISO: Backup vazio ou falhou. Container pode estar vazio."
            rm -f "$BACKUP_FILE"
        fi
    else
        echo ">>> Container postgres nao esta rodando. Pulando backup."
    fi
}

# Funcao para verificar volumes
check_volumes() {
    local VOLUME_NAME=$1

    if docker volume ls | grep -q "$VOLUME_NAME"; then
        echo ">>> Volume $VOLUME_NAME encontrado."
        VOLUME_SIZE=$(docker system df -v 2>/dev/null | grep "$VOLUME_NAME" | awk '{print $4}' || echo "desconhecido")
        echo ">>> Tamanho do volume: $VOLUME_SIZE"
    else
        echo "AVISO: Volume $VOLUME_NAME nao encontrado. Sera criado no deploy."
    fi
}

# Build e deploy
if [ "$ENV" == "prod" ]; then
    echo ""
    echo "=== Verificacoes Pre-Deploy ==="

    # Verificar volume de dados
    check_volumes "netloop-prod_postgres_data"

    # Criar backup antes de qualquer alteracao
    create_backup "docker-compose.prod.yml" "netloop-prod" ".env.prod"

    echo ""
    echo "=== Iniciando Deploy ==="

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
    echo ""
    echo "=== Verificacoes Pre-Deploy ==="

    # Verificar volume de dados
    check_volumes "netloop-dev_postgres_data"

    # Criar backup antes de qualquer alteracao
    create_backup "docker-compose.dev.yml" "netloop-dev" ".env.dev"

    echo ""
    echo "=== Iniciando Deploy ==="

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

echo ""
echo "Backups disponiveis:"
ls -lh $BACKUP_DIR/backup_${ENV}_*.sql 2>/dev/null | tail -5 || echo "  Nenhum backup encontrado"
echo ""
echo "Para restaurar um backup, use: ./restore.sh [arquivo_backup.sql] [dev|prod]"
