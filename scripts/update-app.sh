#!/bin/bash

# MarkSwift Application Update Script
# This script updates an existing MarkSwift Docker deployment.
# Run this from the server, inside the MarkSwift application directory.

set -e # Exit immediately if a command exits with a non-zero status.

# --- Configuration (should match deploy.sh) ---
APP_NAME="markswift"
CONTAINER_NAME="markswift-app"
IMAGE_NAME="markswift-img"
APP_DIR="/opt/MarkSwift" # Ensure this is where your app code resides
GIT_BRANCH="main" # Or your preferred branch

# Ports (needed if you were to re-run the container from scratch, but usually not changed on update)
# HOST_PORT="3000"
# CONTAINER_PORT="3000"

# Volumes (needed if you were to re-run the container from scratch)
# UPLOADS_VOL="${APP_DIR}/data/uploads:/usr/src/app/server/uploads"
# PDFS_VOL="${APP_DIR}/data/converted-pdfs:/usr/src/app/server/converted-pdfs"
# ZIPS_VOL="${APP_DIR}/data/zips:/usr/src/app/server/zips"
# CONFIG_VOL="${APP_DIR}/config.json:/usr/src/app/config.json"

# --- Helper Functions ---
ensure_docker_running() {
    if ! docker info > /dev/null 2>&1; then
        echo "❌ Docker daemon is not running. Please start Docker and try again."
        exit 1
    fi
    echo "✅ Docker daemon is running."
}

# --- Main Update Logic ---
echo "🚀 Starting MarkSwift Application Update..."

ensure_docker_running

# 1. Navigate to Application Directory
if [ ! -d "$APP_DIR" ] || [ ! -d "$APP_DIR/.git" ]; then
    echo "❌ Application directory $APP_DIR with .git folder not found."
    echo "Please run the main deploy.sh script first or ensure you are in the correct directory."
    exit 1
fi
cd "$APP_DIR"
echo "📂 In application directory: $(pwd)"

# 2. Pull Latest Changes
echo "🔄 Pulling latest changes from Git repository (branch: $GIT_BRANCH)..."
git checkout "$GIT_BRANCH"
git pull origin "$GIT_BRANCH"
echo "✅ Code updated."

# 3. Rebuild Docker Image
echo "🐳 Rebuilding Docker image '$IMAGE_NAME'..."
docker build -t "$IMAGE_NAME" .
echo "✅ Docker image rebuilt."

# 4. Stop, Remove, and Re-run Container
echo "🔄 Restarting application container '$CONTAINER_NAME'..."

if [ "$(docker ps -q -f name="^/${CONTAINER_NAME}$")" ]; then
    echo "🛑 Stopping existing container '$CONTAINER_NAME'..."
    docker stop "$CONTAINER_NAME"
    echo "✅ Container stopped."
else
    echo "ℹ️ Container '$CONTAINER_NAME' is not running."
fi

if [ "$(docker ps -aq -f name="^/${CONTAINER_NAME}$")" ]; then
    echo "🗑️ Removing existing container '$CONTAINER_NAME'..."
    docker rm "$CONTAINER_NAME"
    echo "✅ Container removed."
else
    echo "ℹ️ No existing container named '$CONTAINER_NAME' to remove."
fi

# Re-run the container using the same parameters as in deploy.sh
# Ensure these parameters match your deploy.sh script if you customized it.
echo "🚀 Running new Docker container '$CONTAINER_NAME' with updated image..."
docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p "3000:3000" \
    -v "${APP_DIR}/data/uploads:/usr/src/app/server/uploads" \
    -v "${APP_DIR}/data/converted-pdfs:/usr/src/app/server/converted-pdfs" \
    -v "${APP_DIR}/data/zips:/usr/src/app/server/zips" \
    -v "${APP_DIR}/config.json:/usr/src/app/config.json" \
    "$IMAGE_NAME"
echo "✅ New container '$CONTAINER_NAME' started with updated image."

# 5. Display Container Status
echo "🔎 Displaying status for container '$CONTAINER_NAME':"
docker ps -f name="^/${CONTAINER_NAME}$"
echo "🪵 To view logs, run: docker logs -f $CONTAINER_NAME"

echo "🎉 MarkSwift application update complete!"
