# Stage 1: Build
FROM oven/bun:1.1.38-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build application
RUN bun run build

# Stage 2: Production
FROM oven/bun:1.1.38-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S bunuser -u 1001

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install production dependencies only
RUN bun install --production --frozen-lockfile && \
    bun pm cache rm

# Copy built application from builder
COPY --from=builder --chown=bunuser:nodejs /app/dist ./dist

# Create uploads directory
RUN mkdir -p uploads && chown -R bunuser:nodejs uploads

# Switch to non-root user
USER bunuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD bun run -e "await fetch('http://localhost:3000/health')"

# Start application
CMD ["bun", "run", "dist/index.js"]
