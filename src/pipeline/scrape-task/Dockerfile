# Use Puppeteer base image with Chromium pre-installed
# Pulled via ECR pull-through cache from GitHub Container Registry
ARG ECR_REGISTRY
FROM ${ECR_REGISTRY}/ghcr/puppeteer/puppeteer:24.0.0

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json tsconfig.json ./

# Install dependencies (runs as pptruser, not root)
RUN npm ci

# Copy all source files (including subdirectories)
COPY *.ts ./
COPY extractors/ ./extractors/
COPY scraper/ ./scraper/
COPY storage/ ./storage/
COPY utils/ ./utils/

RUN npm run build

# Run the task
CMD ["node", "dist/index.js"]
