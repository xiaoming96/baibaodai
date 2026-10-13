FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATABASE_PATH=/app/data/pocket.sqlite \
    SERVE_STATIC=false \
    TZ=Asia/Shanghai

WORKDIR /app

# The backend uses Node built-ins. Vue/Vite dependencies are only for frontend builds.
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node src/lib/game.js ./src/lib/game.js

RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3001
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "--input-type=module", "-e", "const response = await fetch('http://127.0.0.1:' + process.env.PORT + '/api/health', { signal: AbortSignal.timeout(4000) }); if (!response.ok || (await response.json()).ok !== true) process.exit(1);"]

CMD ["node", "server/index.js"]
