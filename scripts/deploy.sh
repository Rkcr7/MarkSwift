#!/bin/bash

# MarkSwift Deployment Script
# This script deploys or updates the MarkSwift application using Docker.
# Run this from the server where MarkSwift code will be cloned/pulled.

set -e # Exit immediately if a command exits with a non-zero status.

# --- Configuration ---
APP_NAME="markswift"
CONTAINER_NAME="markswift-app"
IMAGE_NAME="markswift-img" # Changed from just "markswift" to avoid conflict with potential user name
APP_DIR="/opt/MarkSwift" # Must match the directory used in setup-server.sh or where you clone
GIT_REPO_URL="https://github.com/your-username/MarkSwift.git" # !!! REPLACE THIS with your actual Git repository URL !!!
GIT_BRANCH="main" # Or your preferred branch

# Ports
HOST_PORT="3000" # Port on the host machine
CONTAINER_PORT="3000" # Port the app listens on inside the container (from Dockerfile EXPOSE)

# Volumes for persistent data (must be absolute paths)
# These paths are on the HOST machine and will be mapped into the container.
UPLOADS_VOL="${APP_DIR}/data/uploads:/usr/src/app/server/uploads"
PDFS_VOL="${APP_DIR}/data/converted-pdfs:/usr/src/app/server/converted-pdfs"
ZIPS_VOL="${APP_DIR}/data/zips:/usr/src/app/server/zips"
CONFIG_VOL="${APP_DIR}/config.json:/usr/src/app/config.json" # Mount config.json

# --- Helper Functions ---
ensure_docker_running() {
    if ! docker info > /dev/null 2>&1; then
        echo "❌ Docker daemon is not running. Please start Docker and try again."
        exit 1
    fi
    echo "✅ Docker daemon is running."
}

# --- Main Deployment Logic ---
echo "🚀 Starting MarkSwift Deployment/Update..."

ensure_docker_running

# 1. Prepare Application Directory & Code
if [ -d "$APP_DIR/.git" ]; then
    echo "🔄 Found existing repository in $APP_DIR. Pulling latest changes..."
    cd "$APP_DIR"
    git checkout "$GIT_BRANCH"
    git pull origin "$GIT_BRANCH"
    echo "✅ Code updated."
else
    echo "📁 Cloning repository from $GIT_REPO_URL into $APP_DIR..."
    git clone --branch "$GIT_BRANCH" "$GIT_REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
    echo "✅ Repository cloned."
fi

# Ensure data directories for volumes exist on the host
echo " memastikan direktori data untuk volume ada di host..."
mkdir -p "${APP_DIR}/data/uploads"
mkdir -p "${APP_DIR}/data/converted-pdfs"
mkdir -p "${APP_DIR}/data/zips"

# Ensure config.json exists in the APP_DIR for mounting
# If it's not in your repo at the root, this script assumes it will be created or copied here.
# For this script, we assume config.json is part of your repository at the root.
if [ ! -f "${APP_DIR}/config.json" ]; then
    echo "⚠️ WARNING: config.json not found in ${APP_DIR}."
    echo "Please ensure config.json is present in your repository root or copy it to ${APP_DIR}."
    echo "The application might use default settings or fail to start without it."
    # As a fallback, copy from server/ if it exists there as a template, though ideally it's at root.
    if [ -f "${APP_DIR}/server/config.json.template" ]; then # Assuming you might have a template
        cp "${APP_DIR}/server/config.json.template" "${APP_DIR}/config.json"
        echo "📋 Copied config.json.template to config.json. Please review it."
    elif [ -f "${APP_DIR}/config.json.example" ]; then
        cp "${APP_DIR}/config.json.example" "${APP_DIR}/config.json"
        echo "📋 Copied config.json.example to config.json. Please review it."
    fi
fi


# 2. Build Docker Image
echo "🐳 Building Docker image '$IMAGE_NAME'..."
# The Dockerfile should be at the root of your repository ($APP_DIR)
docker build -t "$IMAGE_NAME" .
echo "✅ Docker image built."

# 3. Stop and Remove Existing Container (if any)
if [ "$(docker ps -q -f name="^/${CONTAINER_NAME}$")" ]; then
    echo "🛑 Stopping existing container '$CONTAINER_NAME'..."
    docker stop "$CONTAINER_NAME"
    echo "✅ Container stopped."
fi
if [ "$(docker ps -aq -f name="^/${CONTAINER_NAME}$")" ]; then
    echo "🗑️ Removing existing container '$CONTAINER_NAME'..."
    docker rm "$CONTAINER_NAME"
    echo "✅ Container removed."
fi

# 4. Run New Docker Container
echo "🚀 Running new Docker container '$CONTAINER_NAME'..."
docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p "${HOST_PORT}:${CONTAINER_PORT}" \
    -v "$UPLOADS_VOL" \
    -v "$PDFS_VOL" \
    -v "$ZIPS_VOL" \
    -v "$CONFIG_VOL" \
    "$IMAGE_NAME"

echo "✅ New container '$CONTAINER_NAME' started."

# 5. Display Container Status and Logs (optional)
echo "🔎 Displaying status for container '$CONTAINER_NAME':"
docker ps -f name="^/${CONTAINER_NAME}$"
echo "🪵 To view logs, run: docker logs -f $CONTAINER_NAME"
echo "🌐 Application should be accessible on port $HOST_PORT (or via Nginx if configured)."

echo "🎉 MarkSwift deployment/update complete!"
echo "IMPORTANT: Remember to replace 'https://github.com/your-username/MarkSwift.git' in this script with your actual repository URL."
