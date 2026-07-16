# ── sandbox-agent stage ──
# Downloads the pinned sandbox-agent binary (rivet-dev) and checksum-verifies
# it at build time. Per architecture.md (line 76, 673) the sandbox-agent
# version is pinned in the Dockerfile, not as a code constant. The binary is
# uploaded to the sandbox during provision (SandboxService.installBinaries).
FROM node:24-slim AS sandbox-agent
ARG SANDBOX_AGENT_VERSION=0.4.2
ARG SANDBOX_AGENT_SHA256=bab098abef874ade481aa7b50463662814fbf27294399f545307fedb638f029b
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL --max-time 120 --retry 3 "https://releases.rivet.dev/sandbox-agent/${SANDBOX_AGENT_VERSION}/binaries/sandbox-agent-x86_64-unknown-linux-musl" -o /opt/sandbox-agent \
    && echo "${SANDBOX_AGENT_SHA256}  /opt/sandbox-agent" | sha256sum -c - \
    && chmod +x /opt/sandbox-agent

# ── Install stage ──
FROM node:24-slim AS install
RUN corepack enable
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
# NOTE: .yarn/ (patches/plugins/releases) is gitignored and therefore absent
# from Railway's git-based build context. If patches are added in the future,
# update .gitignore to track .yarn/patches/ and add a COPY here. See
# .dockerignore for the list of Yarn Berry directories that must be tracked.
RUN yarn install --immutable

# ── Build stage ──
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN yarn nx run database-schemas:generate
RUN yarn nx build agent-be

# ── Runtime stage ──
FROM node:24-slim AS runtime
ENV NODE_ENV=production
RUN corepack enable && corepack prepare yarn@4.17.0 --activate
WORKDIR /app
# NFR-4-3-M1: copy with --chown=node:node so the runtime files are owned by
# the non-root `node` user (uid 1000, shipped with node:24-slim). The final
# stage drops to USER node before CMD so the container does not run as root.
COPY --from=build --chown=node:node /app/dist/apps/agent-be/ ./
COPY --from=build --chown=node:node /app/.yarnrc.yml ./
COPY --from=build --chown=node:node /app/package.json /tmp/root-package.json
COPY --from=build --chown=node:node /app/yarn.lock /tmp/root-yarn.lock
# Epic 6: copy the pinned sandbox-agent binary into the runtime image.
COPY --from=sandbox-agent --chown=node:node /opt/sandbox-agent /opt/sandbox-agent
# Merge root deps into the pruned runtime package.json and force-add `ws`:
#   (1) NestJS runtime requires dependencies hoisted at the package root, but
#       `generatePackageJson: true` (Nx build pruner) only emits the app's
#       direct deps — transitive runtime deps from the workspace root are
#       dropped. Merging root.dependencies restores them so `yarn install`
#       can rehydrate the full runtime dependency tree.
#   (2) `ws` is a transitive dependency of the Daytona SDK that is NOT
#       included by generatePackageJson (the pruner only walks the app's
#       direct deps), yet it is required at runtime. Force-adding it to
#       ^8.18.0 pins the version the SDK was built/tested against.
RUN node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('./package.json','utf8'));const root=JSON.parse(fs.readFileSync('/tmp/root-package.json','utf8'));pkg.dependencies={...root.dependencies,...pkg.dependencies};pkg.dependencies['ws']='^8.18.0';fs.writeFileSync('./package.json',JSON.stringify(pkg,null,2));fs.copyFileSync('/tmp/root-yarn.lock','./yarn.lock');fs.unlinkSync('/tmp/root-package.json');fs.unlinkSync('/tmp/root-yarn.lock')"
RUN yarn install
# Ensure node_modules (created by root during yarn install) and the rest of
# /app are readable/writable by the non-root node user before dropping privs.
RUN chown -R node:node /app
EXPOSE 3001
# Validate PORT as numeric before using it in the healthcheck URL — a
# non-numeric PORT (e.g. set to an empty string or a label) would otherwise
# produce a malformed 127.0.0.1:PORT/health URL that silently never succeeds.
# Fall back to 3001 with a warning, matching the env-configured numeric
# threshold pattern (Number.isFinite guard) from project-context.md.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const rawPort=process.env.PORT;const port=(rawPort!==undefined&&rawPort!==''&&Number.isFinite(Number(rawPort)))?Number(rawPort):3001;if(rawPort!==undefined&&(rawPort===''||!Number.isFinite(Number(rawPort)))){console.warn('PORT=\"'+rawPort+'\" is not numeric; falling back to 3001 for healthcheck')}const r=http.get('http://127.0.0.1:'+port+'/health',res=>process.exit(res.statusCode===200?0:1));r.on('error',()=>process.exit(1))"
# Drop from root to the non-root `node` user (shipped with node:24-slim).
# The node binary is in PATH for all users, so the HEALTHCHECK above still
# executes; PORT is read from the process environment which is unaffected by
# the USER directive. Files under /app are owned by node (see --chown above
# and the chown -R after yarn install).
USER node
CMD ["node", "main.js"]
