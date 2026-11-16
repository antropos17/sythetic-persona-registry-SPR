FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS client-build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY scripts/build-client.mjs ./scripts/
COPY site/app ./site/app
COPY site/styles ./site/styles
COPY data/personas.json data/runtime-assets.json ./data/
RUN npm run build

FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4176 \
    SPR_DB_PATH=/app/var/spr.sqlite
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node site/index.html ./site/index.html
COPY --from=client-build --chown=node:node /build/site/dist ./site/dist
COPY --chown=node:node data/personas.json data/media-provenance.json data/runtime-assets.json ./data/
COPY --chown=node:node assets ./assets
RUN mkdir -p /app/var && chown node:node /app/var
USER node
EXPOSE 4176
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:4176/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
