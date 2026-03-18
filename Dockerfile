# Stage 1: build the client library (no native deps needed)
FROM node:22-alpine AS builder
WORKDIR /app/client
COPY client/package.json ./
RUN npm install --ignore-scripts
COPY tsconfig.base.json /app/
COPY client/tsconfig.json ./
COPY client/src/ ./src/
RUN npm run build

# Stage 2: runtime
FROM node:22-alpine
WORKDIR /app
COPY discord-bot/package.json ./
COPY client/package.json ./client/
COPY discord-bot/package.json ./discord-bot/
# Remove prepare so npm does not try to compile the client again
RUN npm pkg delete scripts.prepare --prefix client
COPY --from=builder /app/client/dist ./client/dist
# Use npm install (not ci) so npm resolves correct Linux native binaries
# instead of using the Windows-generated package-lock.json
RUN npm install
COPY discord-bot/src/ ./discord-bot/src/
WORKDIR /app/discord-bot
CMD ["npm", "start"]