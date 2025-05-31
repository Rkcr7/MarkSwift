# 1. Base Image: Use an official Node.js image.
# Using a specific LTS version is good practice (e.g., Node 18 or 20).
# Choose one that comes with a Debian-based OS for easier package management.
FROM node:18-slim AS base

# Set working directory
WORKDIR /usr/src/app

# Install Puppeteer dependencies (Chromium system libraries)
# This list is comprehensive and should cover most needs for Puppeteer.
# Using `apt-get update && apt-get install -y --no-install-recommends` is standard.
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

# 2. Dependencies Stage: Install npm dependencies
# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (including devDependencies for build steps like Tailwind)
# Using --omit=dev for production build after this step if needed, but for simplicity keeping them for now
# as Tailwind build needs devDependencies.
RUN npm install --include=dev

# 3. Build Stage: Build Tailwind CSS
# Copy the rest of your application code
COPY . .

# Run the Tailwind CSS build script
RUN npm run build:css

# 4. Production Stage: Create a lean production image
# Use a new Node.js slim image for the final stage
FROM node:18-slim AS production

WORKDIR /usr/src/app

# Copy Puppeteer system dependencies from the 'base' stage's /usr/lib and /lib
# This is a common approach to keep the final image smaller.
# We need to be careful to copy the right directories.
# A more robust way is to identify exact .so files needed by chrome.
# For now, copying common lib paths.
COPY --from=base /lib/ /lib/
COPY --from=base /usr/lib/ /usr/lib/
COPY --from=base /etc/fonts /etc/fonts
COPY --from=base /usr/share/fonts /usr/share/fonts

# Copy only necessary production files from the 'base' stage (which now includes built assets)
COPY --from=base /usr/src/app/node_modules ./node_modules
COPY --from=base /usr/src/app/package.json ./package.json
COPY --from=base /usr/src/app/public ./public
COPY --from=base /usr/src/app/server ./server
COPY --from=base /usr/src/app/config.json ./config.json
COPY --from=base /usr/src/app/tailwind.config.js ./tailwind.config.js
# package-lock.json is not strictly needed if node_modules is copied directly

# Expose the port the app runs on (from your config or default)
EXPOSE 3000

# Set environment variable for Puppeteer to find Chromium if needed
# This is often not required if system libraries are correctly installed and Puppeteer uses its bundled Chromium.
# However, for system-installed Chromium, you might need to set this.
# For now, we rely on Puppeteer's bundled Chromium and the system libs.
# ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Command to run the application
# This uses the "start_docker" script from your package.json
CMD ["npm", "run", "start_docker"]
