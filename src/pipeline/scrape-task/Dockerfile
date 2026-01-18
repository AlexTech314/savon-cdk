# Use Puppeteer base image with Chromium pre-installed
FROM ghcr.io/puppeteer/puppeteer:24.0.0

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json tsconfig.json ./

# Install dependencies (runs as pptruser, not root)
RUN npm ci

# Copy source and build
COPY *.ts ./
RUN npm run build

# Run the task
CMD ["node", "dist/index.js"]
