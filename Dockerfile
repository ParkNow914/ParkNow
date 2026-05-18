# syntax=docker/dockerfile:1.6

# ---- Base image ----
FROM node:18-alpine AS base
WORKDIR /app
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

# ---- Dependencies stage ----
FROM base AS deps
COPY package.json package-lock.json ./
# Production-only deps for the final image
RUN npm ci --omit=dev && npm cache clean --force

# ---- Final image ----
FROM base AS runtime

# Install tini for proper signal handling (PID 1)
RUN apk add --no-cache tini && \
    addgroup -S parknow && adduser -S parknow -G parknow

WORKDIR /app

# Copy installed deps from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=parknow:parknow . .

# Ensure runtime directories exist and are writable
RUN mkdir -p logs uploads && chown -R parknow:parknow logs uploads

USER parknow

EXPOSE 3000

# Healthcheck hits the public /health endpoint introduced in this onda
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
