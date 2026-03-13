#!/bin/bash

# NetLoop Restore Script
# Uso: ./restore.sh [arquivo_backup.sql] [dev|prod]
#
# Este script restaura um backup do banco de dados PostgreSQL.
# ATENCAO: Este script ira SUBSTITUIR todos os dados atuais!

set -e

BACKUP_FILE=$1
ENV=$2

# Validar argumentos
if [ -z "$BACKUP_FILE" ] || [ -z "$ENV" ]; then
    echo "Uso: ./restore.sh [arquivo_backup.sql] [dev|prod]"
    echo ""
    echo "Exemplos:"
    echo "  ./restore.sh backups/backup_prod_20260313_120000.sql prod"
    echo "  ./restore.sh backups/backup_dev_20260313_120000.sql dev"
    echo ""
    echo "Backups disponiveis:"
    ls -lh backups/*.sql 2>/dev/null || echo "  Nenhum backup encontrado"
    exit 1
fi

if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
    echo "ERRO: Ambiente deve ser 'dev' ou 'prod'"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERRO: Arquivo de backup nao encontrado: $BACKUP_FILE"
    exit 1
fi

# Configurar variaveis baseado no ambiente
if [ "$ENV" == "prod" ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    PROJECT_NAME="netloop-prod"
    ENV_FILE=".env.prod"
else
    COMPOSE_FILE="docker-compose.dev.yml"
    PROJECT_NAME="netloop-dev"
    ENV_FILE=".env.dev"
fi

# Diretorio do projeto
PROJECT_DIR="/opt/netloop"
cd $PROJECT_DIR

# Carregar variaveis de ambiente
if [ ! -f "$ENV_FILE" ]; then
    echo "ERRO: Arquivo de ambiente nao encontrado: $ENV_FILE"
    exit 1
fi
source $ENV_FILE

echo ""
echo "=========================================="
echo "   RESTAURACAO DE BACKUP - NetLoop $ENV"
echo "=========================================="
echo ""
echo "Arquivo de backup: $BACKUP_FILE"
echo "Tamanho: $(du -h "$BACKUP_FILE" | cut -f1)"
echo "Ambiente: $ENV"
echo ""
echo "ATENCAO: Esta operacao ira SUBSTITUIR todos os dados atuais!"
echo ""
read -p "Tem certeza que deseja continuar? (digite 'SIM' para confirmar): " CONFIRM

if [ "$CONFIRM" != "SIM" ]; then
    echo "Operacao cancelada."
    exit 0
fi

echo ""
echo ">>> Verificando se container postgres esta rodando..."

# Verificar se container postgres esta rodando
if ! docker compose -f $COMPOSE_FILE -p $PROJECT_NAME --env-file $ENV_FILE ps postgres 2>/dev/null | grep -q "running"; then
    echo ">>> Container postgres nao esta rodando. Iniciando..."
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME --env-file $ENV_FILE up -d postgres
    echo ">>> Aguardando postgres ficar pronto..."
    sleep 10
fi

# Criar backup do estado atual antes de restaurar
CURRENT_BACKUP="backups/pre_restore_${ENV}_$(date +%Y%m%d_%H%M%S).sql"
echo ">>> Criando backup do estado atual: $CURRENT_BACKUP"
docker compose -f $COMPOSE_FILE -p $PROJECT_NAME --env-file $ENV_FILE exec -T postgres \
    pg_dump -U $DB_USER -d $DB_NAME > "$CURRENT_BACKUP" 2>/dev/null || true

if [ -s "$CURRENT_BACKUP" ]; then
    echo ">>> Backup do estado atual criado com sucesso"
else
    echo ">>> Aviso: Nao foi possivel criar backup do estado atual (banco pode estar vazio)"
    rm -f "$CURRENT_BACKUP"
fi

echo ""
echo ">>> Parando backend para evitar conflitos..."
docker compose -f $COMPOSE_FILE -p $PROJECT_NAME --env-file $ENV_FILE stop backend 2>/dev/null || true

echo ""
echo ">>> Restaurando backup..."

# Dropar conexoes existentes e recriar banco
docker compose -f $COMPOSE_FILE -p $PROJECT_NAME --env-file $ENV_FILE exec -T postgres psql -U $DB_USER -d postgres << EOF
-- Terminar todas as conexoes ao banco
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = '$DB_NAME'
AND pid <> pg_backend_pid();

-- Dropar e recriar banco
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME;
EOF

# Restaurar o backup
cat "$BACKUP_FILE" | docker compose -f $COMPOSE_FILE -p $PROJECT_NAME --env-file $ENV_FILE exec -T postgres psql -U $DB_USER -d $DB_NAME

echo ""
echo ">>> Reiniciando backend..."
docker compose -f $COMPOSE_FILE -p $PROJECT_NAME --env-file $ENV_FILE start backend

echo ""
echo "=========================================="
echo "   RESTAURACAO CONCLUIDA COM SUCESSO!"
echo "=========================================="
echo ""
echo "Backup restaurado: $BACKUP_FILE"
if [ -f "$CURRENT_BACKUP" ]; then
    echo "Backup pre-restore salvo em: $CURRENT_BACKUP"
fi
echo ""
echo "Verificar dados:"
echo "  docker compose -f $COMPOSE_FILE -p $PROJECT_NAME --env-file $ENV_FILE exec postgres psql -U $DB_USER -d $DB_NAME -c '\\dt'"
echo ""
