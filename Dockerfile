FROM node:20-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx vite build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npx", "tsx", "server/index.ts"]
