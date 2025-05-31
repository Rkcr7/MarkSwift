# Stage 1: Install Puppeteer System Dependencies
FROM node:18-slim AS puppeteer_deps

# Install Puppeteer's system dependencies
# Using --no-install-recommends to keep it lean
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Add Google Chrome repository and install Chrome
RUN apt-get update && apt-get install -y gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Stage 2: Build Application (Install ALL dependencies, build CSS)
FROM node:18-slim AS builder

WORKDIR /usr/src/app

# Copy system dependencies from the puppeteer_deps stage
COPY --from=puppeteer_deps / /

# Copy package files (only package.json as package-lock.json was removed)
COPY package.json ./

# Install ALL dependencies (including devDependencies for Tailwind build)
# Using npm install --legacy-peer-deps as package-lock.json is not used here.
RUN npm install --include=dev --legacy-peer-deps

# Copy the rest of your application code
COPY . .

# Run the Tailwind CSS build script
RUN npm run build:css

# Optional: Prune devDependencies if they are not needed for the runtime
# RUN npm prune --production

# Stage 3: Production Image (Copy artifacts from builder)
FROM node:18-slim AS production

WORKDIR /usr/src/app

# Copy system dependencies from the puppeteer_deps stage
COPY --from=puppeteer_deps / /

# Set user to non-root (optional but good practice)
# Create a non-root user and group called "appuser"
# RUN groupadd -r appuser && useradd -r -g appuser -s /bin/false -d /usr/src/app appuser
# USER appuser
# Ensure /usr/src/app is writable by appuser if you create files at runtime outside of mounted volumes.

# Copy built application and node_modules from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json
# package-lock.json is not copied as it was removed
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/server ./server
COPY --from=builder /usr/src/app/config.json ./config.json
COPY --from=builder /usr/src/app/tailwind.config.js ./tailwind.config.js

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production
# PUPPETEER_CACHE_DIR=/usr/src/app/.cache/puppeteer # Optional: if you want to control cache location

# Command to run the application
# This uses the "start_docker" script from your package.json
CMD ["npm", "run", "start_docker"]
