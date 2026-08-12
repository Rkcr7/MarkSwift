# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: build
# Installs every dependency (devDependencies included, Tailwind needs them),
# compiles the CSS bundle, then prunes back to production dependencies so the
# runtime stage can copy node_modules across as-is.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /usr/src/app

# Puppeteer would otherwise download its own ~150MB Chromium during install.
# The runtime stage installs google-chrome-stable from apt instead, so that
# download is pure waste.
ENV PUPPETEER_SKIP_DOWNLOAD=1

# Copy manifests first so this layer only busts when dependencies change.
COPY package.json package-lock.json ./

# `npm ci` installs exactly what the lockfile pins. The previous Dockerfile
# copied only package.json and ran `npm install`, which meant the committed
# lockfile was ignored and no two builds were guaranteed to match.
RUN npm ci --include=dev

COPY . .

RUN npm run build:css \
    && npm prune --omit=dev \
    && npm cache clean --force

# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS production

WORKDIR /usr/src/app

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    PORT=3000

# Install Chrome from Google's apt repository.
#
# Two notes on what changed here:
#   * The old Dockerfile hand-listed ~35 shared libraries. Unnecessary — the
#     google-chrome-stable package declares those as dependencies, so apt pulls
#     the correct set automatically and keeps it correct over time.
#   * It also used `apt-key add`, which is deprecated and slated for removal.
#     Modern practice is a keyring in /etc/apt/keyrings referenced by signed-by.
#
# fonts-noto-core and fonts-noto-color-emoji make the PDF renderer's font stack
# resolvable offline; the renderer used to fetch these from Google Fonts on
# every conversion.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        dumb-init \
        fonts-liberation \
        fonts-noto-core \
        fonts-noto-color-emoji \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
        | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
    && chmod a+r /etc/apt/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
        > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable \
    && apt-get purge -y --auto-remove gnupg \
    && rm -rf /var/lib/apt/lists/*

# Run as an unprivileged user. The base image already ships a `node` user.
# Directories the app writes to at runtime are created and handed over here so
# the process never needs to mkdir into a root-owned path.
RUN mkdir -p server/uploads server/converted-pdfs server/zips \
    && chown -R node:node /usr/src/app

COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/package.json ./package.json
COPY --from=builder --chown=node:node /usr/src/app/public ./public
COPY --from=builder --chown=node:node /usr/src/app/server ./server
COPY --from=builder --chown=node:node /usr/src/app/config.json ./config.json

USER node

EXPOSE 3000

# Chrome forks a tree of child processes. Without an init as PID 1 those become
# zombies and the container leaks processes over time; dumb-init reaps them and
# forwards SIGTERM so the existing graceful-shutdown handler actually fires.
ENTRYPOINT ["dumb-init", "--"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start_docker"]
