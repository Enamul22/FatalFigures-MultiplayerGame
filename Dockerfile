FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts
FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node --chmod=755 scripts/render-start.sh ./render-start.sh
USER node
EXPOSE 3000
CMD ["/app/render-start.sh"]
