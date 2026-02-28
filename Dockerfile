FROM node:18-alpine

WORKDIR /app

# Install root dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code (excluding frontend which is built separately)
COPY src ./src
COPY config ./config
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Build frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci && npm run build

# Return to app directory
WORKDIR /app

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Create entrypoint script for migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Applying database migrations..."' >> /app/entrypoint.sh && \
    echo 'if npx node-pg-migrate --migrations-dir src/db/migrations --migration-file-language ts up 2>&1 | tee /tmp/migration.log; then' >> /app/entrypoint.sh && \
    echo '  echo "✅ Migrations applied successfully"' >> /app/entrypoint.sh && \
    echo 'else' >> /app/entrypoint.sh && \
    echo '  echo "⚠️  Migrations already applied or non-fatal error occurred"' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    echo 'echo "Starting application..."' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Use entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/index.js"]
