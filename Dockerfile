FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build frontend
WORKDIR /app/frontend
RUN npm ci && npm run build

# Build TypeScript
WORKDIR /app
RUN npm run build

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Create entrypoint script for migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Applying database migrations..."' >> /app/entrypoint.sh && \
    echo 'npx node-pg-migrate --migrations-dir src/db/migrations --migration-file-language ts up || echo "Migrations already applied or failed"' >> /app/entrypoint.sh && \
    echo 'echo "Starting application..."' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Use entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/index.js"]
