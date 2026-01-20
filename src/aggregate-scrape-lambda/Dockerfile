# Build stage - compile TypeScript
FROM public.ecr.aws/docker/library/node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source and build
COPY *.ts ./
RUN npm run build

# Production stage - AWS Lambda base image
FROM public.ecr.aws/lambda/nodejs:20

# Copy built files and dependencies
COPY --from=builder /app/dist ${LAMBDA_TASK_ROOT}
COPY --from=builder /app/node_modules ${LAMBDA_TASK_ROOT}/node_modules

# Set the handler
CMD ["index.handler"]
