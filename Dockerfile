FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
COPY editor ./editor
COPY hosting ./hosting
COPY astro.config.mjs ./
RUN chown -R node:node /app
USER node
ENV MALLOC_ARENA_MAX=2 NODE_ENV=production ASTRO_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=128
EXPOSE 10000
CMD ["node", "editor/hosted.mjs"]
