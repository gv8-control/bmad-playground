# ── Install stage ──
FROM node:24-slim AS install
RUN corepack enable
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
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
COPY --from=build /app/dist/apps/agent-be/ ./
COPY --from=build /app/.yarnrc.yml ./
COPY --from=build /app/package.json /tmp/root-package.json
COPY --from=build /app/yarn.lock /tmp/root-yarn.lock
RUN node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('./package.json','utf8'));const root=JSON.parse(fs.readFileSync('/tmp/root-package.json','utf8'));pkg.dependencies={...root.dependencies,...pkg.dependencies};pkg.dependencies['ws']='^8.18.0';fs.writeFileSync('./package.json',JSON.stringify(pkg,null,2));fs.copyFileSync('/tmp/root-yarn.lock','./yarn.lock');fs.unlinkSync('/tmp/root-package.json');fs.unlinkSync('/tmp/root-yarn.lock')"
RUN yarn install
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const r=http.get('http://127.0.0.1:'+(process.env.PORT||3001)+'/health',res=>process.exit(res.statusCode===200?0:1));r.on('error',()=>process.exit(1))"
CMD ["node", "main.js"]
