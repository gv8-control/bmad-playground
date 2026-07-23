# ── Install stage ──
FROM node:24-slim AS install
RUN corepack enable
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
# NOTE: .yarn/ (patches/plugins/releases) is gitignored and therefore absent
# from Railway's git-based build context. If patches are added in the future,
# update .gitignore to track .yarn/patches/ and add a COPY here.
RUN yarn install --immutable

# ── Build stage ──
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN yarn nx build sandbox-relay

# ── Runtime stage ──
FROM node:24-slim AS runtime
ENV NODE_ENV=production
RUN corepack enable && corepack prepare yarn@4.17.0 --activate
WORKDIR /app
# Copy with --chown=node:node so the runtime files are owned by the non-root
# `node` user (uid 1000, shipped with node:24-slim). The final stage drops to
# USER node before CMD so the container does not run as root.
COPY --from=build --chown=node:node /app/dist/apps/sandbox-relay/ ./
COPY --from=build --chown=node:node /app/.yarnrc.yml ./
COPY --from=build --chown=node:node /app/package.json /tmp/root-package.json
COPY --from=build --chown=node:node /app/yarn.lock /tmp/root-yarn.lock
# Merge root deps into the pruned runtime package.json so transitive runtime
# deps hoisted at the workspace root are available:
#   `generatePackageJson: true` (Nx build pruner) only emits the app's direct
#   deps — transitive runtime deps from the workspace root are dropped.
#   Merging root.dependencies restores them so `yarn install` can rehydrate
#   the full runtime dependency tree.
RUN node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('./package.json','utf8'));const root=JSON.parse(fs.readFileSync('/tmp/root-package.json','utf8'));pkg.dependencies={...root.dependencies,...pkg.dependencies};fs.writeFileSync('./package.json',JSON.stringify(pkg,null,2));fs.copyFileSync('/tmp/root-yarn.lock','./yarn.lock');fs.unlinkSync('/tmp/root-package.json');fs.unlinkSync('/tmp/root-yarn.lock')"
RUN yarn install
# Ensure node_modules (created by root during yarn install) and the rest of
# /app are readable/writable by the non-root node user before dropping privs.
RUN chown -R node:node /app
EXPOSE 3002
# Validate PORT as numeric before using it in the healthcheck URL — a
# non-numeric PORT would produce a malformed 127.0.0.1:PORT/health URL that
# silently never succeeds. Fall back to 3002 with a warning.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const rawPort=process.env.PORT;const port=(rawPort!==undefined&&rawPort!==''&&Number.isFinite(Number(rawPort)))?Number(rawPort):3002;if(rawPort!==undefined&&(rawPort===''||!Number.isFinite(Number(rawPort)))){console.warn('PORT=\"'+rawPort+'\" is not numeric; falling back to 3002 for healthcheck')}const r=http.get('http://127.0.0.1:'+port+'/health',res=>process.exit(res.statusCode===200?0:1));r.on('error',()=>process.exit(1))"
# Drop from root to the non-root `node` user (shipped with node:24-slim).
USER node
CMD ["node", "main.js"]
