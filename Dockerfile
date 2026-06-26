# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — builder: install the whole monorepo and build every package the
# server needs (tui -> ai -> agent -> coding-agent -> server) plus the web UI.
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies first for better layer caching. Copy the root manifests
# and every workspace package.json so `npm ci` can resolve the workspace graph
# without pulling the full sources yet.
COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.json biome.json ./
COPY packages/tui/package.json packages/tui/
COPY packages/ai/package.json packages/ai/
COPY packages/agent/package.json packages/agent/
COPY packages/coding-agent/package.json packages/coding-agent/
COPY packages/server/package.json packages/server/
COPY packages/web-ui/package.json packages/web-ui/
COPY packages/coding-agent/examples/extensions/with-deps/package.json packages/coding-agent/examples/extensions/with-deps/
COPY packages/coding-agent/examples/extensions/custom-provider-anthropic/package.json packages/coding-agent/examples/extensions/custom-provider-anthropic/
COPY packages/coding-agent/examples/extensions/custom-provider-gitlab-duo/package.json packages/coding-agent/examples/extensions/custom-provider-gitlab-duo/
COPY packages/coding-agent/examples/extensions/sandbox/package.json packages/coding-agent/examples/extensions/sandbox/
COPY packages/coding-agent/examples/extensions/gondolin/package.json packages/coding-agent/examples/extensions/gondolin/

# Repo policy: never run lifecycle scripts during install.
RUN npm ci --ignore-scripts

# Now copy the full sources and build.
COPY . .

# Build the server's dependency graph in order, then the web UI bundle.
RUN npm run build \
	&& npm run build:web-ui

# Drop dev dependencies to shrink what the runtime stage carries. Internal
# workspace packages remain symlinked under node_modules.
RUN npm prune --omit=dev --ignore-scripts

# ---------------------------------------------------------------------------
# Stage 2 — runtime: copy the built workspace and run the server.
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Root install state (node_modules with workspace symlinks) and manifests.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Built packages required at runtime by the server.
COPY --from=builder /app/packages/ai/package.json ./packages/ai/package.json
COPY --from=builder /app/packages/ai/dist ./packages/ai/dist
COPY --from=builder /app/packages/agent/package.json ./packages/agent/package.json
COPY --from=builder /app/packages/agent/dist ./packages/agent/dist
COPY --from=builder /app/packages/coding-agent/package.json ./packages/coding-agent/package.json
COPY --from=builder /app/packages/coding-agent/dist ./packages/coding-agent/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/package.json
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/drizzle ./packages/server/drizzle

# Built web UI, served statically by the server in production.
COPY --from=builder /app/packages/web-ui/dist ./packages/web-ui/dist

# Default working directory for agent sessions (mounted as a volume).
RUN mkdir -p /workspace
ENV PI_CWD=/workspace
ENV PI_PORT=3000
ENV PI_HOST=0.0.0.0
ENV PI_WEB_ROOT=/app/packages/web-ui/dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
	CMD node -e "fetch('http://localhost:'+(process.env.PI_PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
