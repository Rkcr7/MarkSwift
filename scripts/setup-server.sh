#!/bin/bash

# MarkSwift Server Setup Script
# This script prepares a new Ubuntu server for MarkSwift deployment.
# Run this script as root or with sudo privileges.

set -e # Exit immediately if a command exits with a non-zero status.
# set -x # Print commands and their arguments as they are executed.

echo "🚀 Starting MarkSwift Server Setup..."

# 1. Update System Packages
echo "🔄 Updating system packages..."
apt update
apt upgrade -y
echo "✅ System packages updated."

# 2. Install Essential Tools (Git, Curl, Wget)
echo "🛠️ Installing essential tools (git, curl, wget)..."
apt install -y git curl wget
echo "✅ Essential tools installed."

# 3. Install Docker
if ! command -v docker &> /dev/null
then
    echo "🐳 Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    # Add current user to docker group to run docker without sudo (requires logout/login or new shell)
    # If running as root, this is not strictly necessary for root but good for non-root users.
    # For a dedicated user: usermod -aG docker your_username
    echo "✅ Docker installed."
else
    echo "🐳 Docker is already installed."
fi

# Ensure Docker service is started and enabled
echo "⚙️ Ensuring Docker service is started and enabled..."
systemctl start docker
systemctl enable docker
echo "✅ Docker service configured."

# 4. Install UFW (Uncomplicated Firewall) and Configure Basic Rules
if ! command -v ufw &> /dev/null
then
    echo "🛡️ UFW not found. Installing UFW..."
    apt install -y ufw
    echo "✅ UFW installed."
else
    echo "🛡️ UFW is already installed."
fi

echo "⚙️ Configuring UFW firewall rules..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh       # Port 22
ufw allow http      # Port 80
ufw allow https     # Port 443
# For testing MarkSwift directly on port 3000 before Nginx setup (optional)
# ufw allow 3000/tcp

# Enable UFW (be careful if connected via SSH, ensure SSH rule is added)
echo "⚠️ Enabling UFW. If you are connected via SSH and haven't allowed SSH, you might get disconnected."
echo "y" | ufw enable # Automatically answer "yes" to the prompt
echo "✅ UFW configured and enabled."
ufw status verbose

# 5. Create Application Directory (Optional, deploy script can also do this)
APP_DIR="/opt/MarkSwift"
if [ ! -d "$APP_DIR" ]; then
    echo "📁 Creating application directory: $APP_DIR"
    mkdir -p "$APP_DIR"
    # chown your_user:your_group "$APP_DIR" # If using a non-root user
    echo "✅ Application directory created."
else
    echo "📁 Application directory $APP_DIR already exists."
fi

echo "🎉 Server setup complete!"
echo "Next steps:"
echo "1. If you created a non-root user and added them to the 'docker' group, log out and log back in as that user."
echo "2. Clone your MarkSwift repository into $APP_DIR (or your chosen directory)."
echo "3. Run the deploy.sh script from within the repository directory."
