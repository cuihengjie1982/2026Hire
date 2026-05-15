FROM node:20-alpine AS builder

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npm run build

# Production stage
FROM node:20-alpine
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/server/dist ./dist

USER appuser
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "dist/index.js"]
