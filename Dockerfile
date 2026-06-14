FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
ENV PUBLIC_TRUSTED_HOST=$PUBLIC_TRUSTED_HOST
RUN npx svelte-kit sync
RUN npm run build
RUN npm prune --production

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY package.json .
EXPOSE $PORT
CMD [ "node", "build" ]
