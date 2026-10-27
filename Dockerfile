FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4176 \
    SPR_DB_PATH=/app/var/spr.sqlite
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node site ./site
COPY --chown=node:node data/personas.json data/media-provenance.json ./data/
COPY --chown=node:node assets ./assets
RUN mkdir -p /app/var && chown node:node /app/var
USER node
EXPOSE 4176
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:4176/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
