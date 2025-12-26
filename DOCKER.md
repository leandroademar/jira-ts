# 🐳 Guia de Uso com Docker

Este guia explica como executar a aplicação Jira Dashboard usando Docker e Docker Compose.

## 📋 Pré-requisitos

- Docker (versão 20.10 ou superior)
- Docker Compose (versão 1.29 ou superior)

## 🚀 Início Rápido

### Opção 1: Docker Compose Standalone (Produção)

Para uma versão standalone simplificada (recomendado para produção):

```bash
# Construir e iniciar
docker-compose -f docker-compose.standalone.yml up --build -d

# Ver logs
docker-compose -f docker-compose.standalone.yml logs -f

# Parar
docker-compose -f docker-compose.standalone.yml down
```

### Opção 2: Docker Compose Completo (Desenvolvimento)

Para desenvolvimento com frontend e backend separados:

```bash
# Construir e iniciar
docker-compose up --build

# Ver logs
docker-compose logs -f

# Parar
docker-compose down
```

### 1. Configurar Variáveis de Ambiente

Certifique-se de ter um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Jira Configuration
REACT_APP_JIRA_EMAIL=your-email@domain.com
REACT_APP_JIRA_API_TOKEN=your-jira-api-token
REACT_APP_JIRA_DOMAIN=your-domain.atlassian.net

# Supabase Configuration (opcional)
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key

# Server Configuration
PORT=3003
NODE_ENV=production
```

### 2. Construir e Executar com Docker Compose

```bash
# Construir e iniciar os containers
docker-compose up --build

# Ou executar em background
docker-compose up -d --build
```

### 3. Acessar a Aplicação

- **Frontend (React Dev Server)**: http://localhost:3000
- **Backend API**: http://localhost:3013
- **Health Check**: http://localhost:3013/api/health

## 🔧 Comandos Úteis

### Docker Compose Standalone (Produção)

```bash
# Iniciar em background
docker-compose -f docker-compose.standalone.yml up -d --build

# Ver logs
docker-compose -f docker-compose.standalone.yml logs -f

# Parar
docker-compose -f docker-compose.standalone.yml down

# Parar e remover volumes
docker-compose -f docker-compose.standalone.yml down -v

# Reiniciar
docker-compose -f docker-compose.standalone.yml restart

# Reconstruir sem cache
docker-compose -f docker-compose.standalone.yml build --no-cache
docker-compose -f docker-compose.standalone.yml up -d
```

### Docker Compose Completo (Desenvolvimento)

```bash
# Iniciar todos os containers (frontend + backend)
docker-compose up

# Iniciar em background
docker-compose up -d

# Iniciar apenas o backend
docker-compose up backend

# Iniciar apenas o frontend
docker-compose up frontend

# Parar containers
docker-compose down

# Parar e remover volumes
docker-compose down -v

# Ver logs de todos os serviços
docker-compose logs -f

# Ver logs apenas do frontend
docker-compose logs -f frontend

# Ver logs apenas do backend
docker-compose logs -f backend

# Reconstruir containers
docker-compose up --build

# Reiniciar um serviço específico
docker-compose restart frontend
docker-compose restart backend
```

### Docker (sem Compose)

```bash
# Construir a imagem
docker build -t jira-dashboard .

# Executar o container
docker run -p 3003:3003 --env-file .env jira-dashboard

# Executar em background
docker run -d -p 3003:3003 --env-file .env --name jira-dashboard jira-dashboard

# Ver logs
docker logs -f jira-dashboard

# Parar o container
docker stop jira-dashboard

# Remover o container
docker rm jira-dashboard
```

## 🏗️ Estrutura dos Dockerfiles

### Dockerfile (Backend/Produção)

O Dockerfile utiliza uma estratégia multi-stage:

1. **Stage 1 (builder)**: Instala dependências e faz o build do frontend React
2. **Stage 2 (production)**: Copia apenas os arquivos necessários para produção

Isso resulta em uma imagem menor e mais eficiente. O servidor Express serve tanto a API quanto os arquivos estáticos do frontend buildado.

### Dockerfile.dev (Frontend/Desenvolvimento)

O Dockerfile.dev é usado para desenvolvimento do frontend:

- Instala todas as dependências (incluindo devDependencies)
- Roda o servidor de desenvolvimento do React com hot-reload
- Monta volumes para permitir edição em tempo real do código
- Expõe a porta 3000 para acesso ao frontend

## 🔍 Troubleshooting

### Porta já em uso

Se as portas 3000 ou 3013 já estiverem em uso:

```bash
# Verificar qual processo está usando as portas
lsof -i :3000
lsof -i :3013

# Ou alterar as portas no docker-compose.yml
# Frontend
ports:
  - "3001:3000"  # Mude 3001 para outra porta disponível

# Backend
ports:
  - "3014:3003"  # Mude 3014 para outra porta disponível
```

### Erro de autenticação do Jira

Verifique se as variáveis de ambiente estão corretas:

```bash
# Verificar variáveis de ambiente no container do backend
docker-compose exec backend env | grep JIRA

# Verificar variáveis de ambiente no container do frontend
docker-compose exec frontend env | grep JIRA
```

### Reconstruir após mudanças no código

```bash
# Reconstruir sem cache
docker-compose build --no-cache

# Ou remover a imagem antiga primeiro
docker-compose down
docker rmi jira-ts-jira-dashboard
docker-compose up --build
```

### Ver logs de erro

```bash
# Logs do backend
docker-compose logs backend

# Logs do frontend
docker-compose logs frontend

# Logs em tempo real de ambos
docker-compose logs -f

# Últimas 100 linhas do backend
docker-compose logs --tail=100 backend

# Últimas 100 linhas do frontend
docker-compose logs --tail=100 frontend
```

## 📦 Variáveis de Ambiente

Todas as variáveis de ambiente do arquivo `.env` são automaticamente carregadas pelo Docker Compose. Certifique-se de não commitar o arquivo `.env` no repositório (ele deve estar no `.gitignore`).

## 🌐 Produção

Para deploy em produção, considere:

1. **Usar um servidor web reverso** (nginx) na frente do container
2. **Configurar HTTPS** com certificados SSL
3. **Usar secrets management** para variáveis sensíveis
4. **Configurar health checks** adequados
5. **Implementar logging** centralizado
6. **Configurar backup** dos dados se necessário

### Exemplo com Nginx

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔐 Segurança

- Nunca commite o arquivo `.env` com credenciais
- Use secrets do Docker ou variáveis de ambiente do sistema
- Mantenha as imagens Docker atualizadas
- Use imagens base oficiais e verificadas
- Configure firewall adequadamente

## 📝 Notas

### Arquitetura

- **Produção**: O servidor Express serve tanto a API quanto os arquivos estáticos do frontend buildado (tudo na porta 3013)
- **Desenvolvimento**: 
  - Frontend roda separadamente na porta 3000 com hot-reload
  - Backend roda na porta 3013
  - O frontend se conecta ao backend através de `REACT_APP_API_URL`

### Hot Reload

O frontend em desenvolvimento tem hot-reload habilitado através de volumes montados:
- `./src` - Código fonte do React
- `./public` - Arquivos públicos
- `./config` - Configurações do webpack
- `./scripts` - Scripts de build

Qualquer alteração nesses arquivos será refletida automaticamente no navegador.

### Variáveis de Ambiente

O frontend precisa das mesmas variáveis de ambiente do backend para funcionar corretamente. Certifique-se de que todas as variáveis `REACT_APP_*` estão configuradas no arquivo `.env`.

