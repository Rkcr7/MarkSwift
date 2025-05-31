# MarkSwift Deployment Guide (DigitalOcean Droplet with Docker)

This guide provides step-by-step instructions for deploying the MarkSwift application to a DigitalOcean Droplet using Docker.

## Prerequisites

1.  **DigitalOcean Account:** You'll need an account with DigitalOcean.
2.  **DigitalOcean Droplet:** A Droplet (VPS) created with:
    *   **Image:** Ubuntu 22.04 LTS (recommended)
    *   **Plan:** At least 2GB RAM / 1 vCPU. The $28/month CPU-Optimized Droplet (4GB RAM / 2 AMD CPUs / 80GB NVMe SSD) is highly recommended for optimal performance.
    *   **SSH Key:** Your SSH public key added to the Droplet for secure access.
3.  **Domain Name (Optional but Recommended):** A registered domain name if you want to use a custom domain and SSL.
4.  **Git Repository:** Your MarkSwift application code hosted in a Git repository (e.g., GitHub, GitLab).
    *   Ensure your `Dockerfile` and `config.json` are in the root of the repository.
    *   Ensure the deployment scripts (`scripts/setup-server.sh`, `scripts/deploy.sh`, etc.) are also in your repository.
5.  **Local Machine:**
    *   `ssh` client to connect to your Droplet.
    *   `git` installed.

## Deployment Steps

### Phase 1: Initial Server Setup

1.  **Connect to Your Droplet:**
    Replace `your_droplet_ip` with your Droplet's IP address.
    ```bash
    ssh root@your_droplet_ip
    ```
    (If you created a non-root user during Droplet creation, use that username instead of `root`).

2.  **Run the Server Setup Script:**
    This script will update your server, install Docker, Git, and configure a basic firewall (UFW).
    *   First, ensure the `scripts/setup-server.sh` script is executable and present on your server. The easiest way is to clone your repository first, then run the script from there.
        ```bash
        # Example: Clone into /opt
        sudo git clone https://github.com/your-username/MarkSwift.git /opt/MarkSwift # Replace with your repo URL
        cd /opt/MarkSwift
        sudo chmod +x scripts/setup-server.sh
        sudo ./scripts/setup-server.sh
        ```
    *   The script will prompt you if UFW is enabled. It's generally safe to proceed.
    *   After the script finishes, if you plan to use a non-root user that was added to the `docker` group, you might need to log out and log back in for group changes to take effect.

### Phase 2: Deploying MarkSwift Application

1.  **Prepare for Deployment:**
    *   Ensure you are in the application directory on your server (e.g., `/opt/MarkSwift`).
    *   **Crucial:** Edit `scripts/deploy.sh` and **replace `https://github.com/your-username/MarkSwift.git`** with your actual Git repository URL if you haven't already or if the script doesn't automatically use the current repo's origin. Also, review other variables like `APP_DIR`.
        ```bash
        nano scripts/deploy.sh 
        # Update GIT_REPO_URL and other variables if needed, save and exit.
        sudo chmod +x scripts/deploy.sh
        ```

2.  **Run the Deployment Script:**
    Execute the `deploy.sh` script from within the root of your cloned MarkSwift repository (e.g., `/opt/MarkSwift`).
    ```bash
    sudo ./scripts/deploy.sh
    ```
    This script will:
    *   Pull the latest code.
    *   Create necessary data directories on the host for Docker volumes.
    *   Build the Docker image using your `Dockerfile`.
    *   Stop and remove any existing MarkSwift container.
    *   Start a new container with persistent volumes for uploads, PDFs, zips, and your `config.json`.

3.  **Verify Deployment:**
    *   The script will output the status of the container.
    *   Check logs:
        ```bash
        sudo docker logs -f markswift-app
        ```
    *   Your application should now be running and accessible on port 3000 of your Droplet's IP address (e.g., `http://your_droplet_ip:3000`). You might need to allow port 3000 through UFW if you haven't set up Nginx yet: `sudo ufw allow 3000/tcp`.

### Phase 3: Setting Up Nginx as a Reverse Proxy (Recommended)

Using Nginx allows you to access your application via standard HTTP (port 80) and HTTPS (port 443) and use a domain name.

1.  **Install Nginx (if not already installed by `setup-server.sh`):**
    ```bash
    sudo apt update
    sudo apt install -y nginx
    ```

2.  **Configure Nginx:**
    *   Copy the `nginx.conf.template` (from your repository's `scripts/` directory) to the Nginx configuration directory.
        ```bash
        # Assuming you are in your app root directory /opt/MarkSwift
        sudo cp scripts/nginx.conf.template /etc/nginx/sites-available/markswift
        ```
    *   Edit the Nginx configuration file:
        ```bash
        sudo nano /etc/nginx/sites-available/markswift
        ```
        *   **Crucial:** Replace `your_domain_or_ip` with your actual domain name or your Droplet's IP address.
        *   Adjust `client_max_body_size` if needed (default 100M should be fine).
        *   Save and exit.

3.  **Enable the Nginx Site Configuration:**
    ```bash
    sudo ln -s /etc/nginx/sites-available/markswift /etc/nginx/sites-enabled/
    # Remove default Nginx site if it exists and conflicts
    # sudo rm /etc/nginx/sites-enabled/default 
    ```

4.  **Test Nginx Configuration and Restart Nginx:**
    ```bash
    sudo nginx -t 
    # If the test is successful:
    sudo systemctl restart nginx
    ```
    Your application should now be accessible via `http://your_domain_or_ip`.

### Phase 4: Securing with SSL (Let's Encrypt - Optional but Highly Recommended)

If you have a domain name, you can secure your site with a free SSL certificate from Let's Encrypt.

1.  **Install Certbot:**
    Certbot is a tool to automate obtaining and renewing Let's Encrypt certificates.
    ```bash
    sudo apt install -y certbot python3-certbot-nginx
    ```

2.  **Obtain SSL Certificate:**
    Replace `your_domain_or_ip` with your actual domain name.
    ```bash
    sudo certbot --nginx -d your_domain_or_ip
    ```
    *   Follow the on-screen prompts. Certbot will ask for your email and agreement to terms.
    *   Choose whether to redirect HTTP traffic to HTTPS (recommended).
    *   Certbot will automatically update your Nginx configuration for SSL.

3.  **Verify Auto-Renewal:**
    Certbot typically sets up a cron job or systemd timer for automatic renewal. You can test it:
    ```bash
    sudo certbot renew --dry-run
    ```

Your MarkSwift application should now be securely accessible via `https://your_domain_or_ip`.

## Updating the Application

1.  **Connect to your server via SSH.**
2.  **Navigate to your application directory (e.g., `/opt/MarkSwift`).**
3.  **Run the update script:**
    ```bash
    sudo ./scripts/update-app.sh
    ```
    This script will:
    *   Pull the latest changes from your Git repository.
    *   Rebuild the Docker image.
    *   Stop, remove, and restart the application container with the new image.

## Troubleshooting

*   **Check Docker Logs:** `sudo docker logs -f markswift-app`
*   **Check Nginx Logs:**
    *   Access log: `/var/log/nginx/markswift.access.log` (if configured in `nginx.conf.template`)
    *   Error log: `/var/log/nginx/markswift.error.log` (or `/var/log/nginx/error.log`)
*   **Nginx Configuration Test:** `sudo nginx -t`
*   **UFW Status:** `sudo ufw status verbose`
*   **Docker Container Status:** `sudo docker ps -a`
*   **Ensure `config.json` is present** in `/opt/MarkSwift/config.json` on the host and correctly mounted into the container. The `deploy.sh` script attempts to handle this.

---

This guide provides a comprehensive path to deploying MarkSwift. Remember to replace placeholder values (like repository URLs and domain names) with your actual information.
