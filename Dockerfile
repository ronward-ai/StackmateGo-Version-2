FROM node:20-slim
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY . .

# Build client assets only — server runs from source via tsx
RUN npx vite build

EXPOSE 8080

CMD ["npx", "tsx", "server/index.ts"]
