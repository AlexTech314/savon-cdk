# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source and build
COPY *.ts ./
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# Copy built files and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Run the task
CMD ["node", "dist/index.js"]
