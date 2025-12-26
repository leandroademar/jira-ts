# Stage 1: Build do frontend React
FROM node:24-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Build do frontend
RUN npm run build

# Stage 2: Imagem de produção
FROM node:24-alpine

WORKDIR /app

# Copiar package.json para instalar apenas dependências de produção
COPY package*.json ./

# Instalar apenas dependências de produção (sem devDependencies)
RUN npm ci --only=production

# Copiar código do servidor
COPY server ./server

# Copiar build do frontend
COPY --from=builder /app/build ./build

# Copiar arquivos públicos necessários
COPY public ./public

# Expor porta do servidor
EXPOSE 3003

# Variável de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3003

# Comando para iniciar o servidor
CMD ["node", "server/index.js"]

