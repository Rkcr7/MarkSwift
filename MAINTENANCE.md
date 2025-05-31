# MarkSwift Server Maintenance and Troubleshooting Guide

This guide provides tips for maintaining your MarkSwift server deployed on a DigitalOcean Droplet with Docker and Nginx, as well as common troubleshooting steps.

## Routine Maintenance

1.  **System Updates:**
    Regularly update your server's operating system and packages to apply security patches and bug fixes.
    ```bash
    ssh your_user@your_droplet_ip
    sudo apt update
    sudo apt upgrade -y
    sudo apt autoremove -y # Remove unused packages
    ```
    Consider enabling unattended upgrades for automatic security updates (use with caution and understanding).

2.  **Docker Updates:**
    Keep Docker updated. The `setup-server.sh` script installs Docker using the official `get.docker.com` script, which usually provides recent versions. Periodically, you can re-run parts of that script or check Docker's official documentation for update procedures.

3.  **Application Updates:**
    Use the `scripts/update-app.sh` script to pull the latest code from your Git repository, rebuild the Docker image, and restart the container.
    ```bash
    cd /opt/MarkSwift # Or your application directory
    sudo ./scripts/update-app.sh
    ```

4.  **SSL Certificate Renewal:**
    If you used Certbot for SSL, it typically sets up automatic renewal. You can check its status:
    ```bash
    sudo certbot renew --dry-run 
    ```
    Ensure the renewal process is working. If not, manually renew: `sudo certbot renew`.

5.  **Backup `config.json`:**
    While `config.json` is mounted from the host, ensure the version in your Git repository is also up-to-date if you make critical changes directly on the server. It's best practice to manage `config.json` via Git.

6.  **Monitor Disk Space:**
    Check disk usage, especially for Docker images, containers, and volumes.
    ```bash
    df -h # General disk usage
    docker system df # Docker disk usage
    ```
    Clean up unused Docker resources:
    ```bash
    docker system prune -a -f --volumes # WARNING: This removes all unused images, containers, networks, and volumes. Use with caution.
    docker image prune -a -f # Remove unused images
    docker container prune -f # Remove stopped containers
    docker volume prune -f # Remove unused volumes (be careful if you have other apps using Docker volumes)
    ```
    MarkSwift's internal cleanup mechanisms should handle temporary conversion files, but host-level Docker cleanup is also good.

7.  **Review Logs:**
    Periodically check application, Nginx, and system logs for errors or unusual activity.
    *   **MarkSwift App (Docker):** `sudo docker logs -f markswift-app`
    *   **Nginx:** `/var/log/nginx/error.log` and `/var/log/nginx/markswift.error.log` (if custom path used)
    *   **System:** `sudo journalctl -xe` or `/var/log/syslog`

## Performance Monitoring

1.  **Resource Usage:**
    Use tools like `htop` (install with `sudo apt install htop`), `top`, or `docker stats markswift-app` to monitor CPU, memory, and I/O usage.
    ```bash
    htop
    sudo docker stats markswift-app
    ```

2.  **Application Responsiveness:**
    Monitor how quickly conversions happen. If they slow down significantly, investigate resource bottlenecks (usually CPU or memory for Puppeteer).

3.  **Nginx Status (Optional):**
    You can configure Nginx's `stub_status` module for basic connection statistics.

## Troubleshooting Common Issues

**1. Application Not Starting / Container Exits Immediately:**
    *   **Check Docker Logs:** `sudo docker logs markswift-app` (without `-f` to see past logs if it exited). Look for errors during Node.js startup, issues with `config.json`, or Puppeteer initialization problems.
    *   **`config.json` Issues:** Ensure `/opt/MarkSwift/config.json` exists on the host and is correctly formatted JSON. The `deploy.sh` script mounts this file.
    *   **Port Conflicts:** Ensure port 3000 (or your configured host port) is not used by another service on the host. `sudo netstat -tulnp | grep 3000`
    *   **Dockerfile Errors:** If the image build failed, `deploy.sh` would have shown errors.
    *   **Puppeteer Issues within Docker:** The `Dockerfile` includes many dependencies. If Puppeteer fails to launch Chrome, logs might indicate missing libraries (though the provided `Dockerfile` is quite comprehensive).

**2. Nginx Errors (e.g., 502 Bad Gateway):**
    *   **Application Container Not Running:** If the `markswift-app` container is stopped or crashing, Nginx can't proxy requests to it. Check `sudo docker ps -a`.
    *   **Nginx Configuration Error:** Test with `sudo nginx -t`. Check Nginx error logs.
    *   **Firewall:** Ensure UFW is allowing HTTP/HTTPS (ports 80/443). `sudo ufw status verbose`.
    *   **Proxy Pass Incorrect:** Verify `proxy_pass http://localhost:3000;` in your Nginx config matches where the Docker container's port is mapped on the host.

**3. File Upload Issues:**
    *   **`client_max_body_size` in Nginx:** If uploading large files/batches, ensure this is set appropriately in your Nginx site configuration (e.g., `client_max_body_size 100M;`).
    *   **Permissions on Volume Mounts:** The `deploy.sh` script creates data directories. Docker usually handles permissions, but if issues arise, check ownership/permissions of `/opt/MarkSwift/data/*` on the host. The Node.js process inside Docker runs as `node` (UID 1000) by default in the official Node images.
    *   **Disk Space:** Ensure the server has enough free disk space.

**4. Slow Conversions:**
    *   **CPU Bottleneck:** Most likely cause. Monitor CPU usage with `htop`. If consistently high, your Droplet might be underpowered for the concurrent load. Consider upgrading or reducing `concurrencyModes.max` in `config.json`.
    *   **Memory Exhaustion:** Monitor with `htop` or `free -h`. If memory is full and swap is heavily used, performance will degrade. The 4GB RAM Droplet should be very good, but check if other services are consuming memory.
    *   **Complex Markdown Files:** Very large or complex Markdown files naturally take longer to convert.

**5. SSL Certificate Issues:**
    *   **Renewal Failures:** Check Certbot logs (`/var/log/letsencrypt/letsencrypt.log`). Ensure your domain's DNS records are correct and your server is accessible on port 80 for HTTP-01 challenges.
    *   **Nginx Not Reloaded After Renewal:** Certbot usually reloads Nginx. If not, `sudo systemctl reload nginx`.

**6. "Permission Denied" Errors (Docker):**
    *   If running `docker` commands without `sudo` and getting permission errors, ensure your user is in the `docker` group and you've logged out/in since adding them. `sudo usermod -aG docker $USER; newgrp docker` (or logout/login).

## Security Best Practices

*   **Keep System Updated:** As mentioned in routine maintenance.
*   **Use SSH Keys:** Disable password authentication for SSH if possible.
*   **Strong Passwords:** For any user accounts.
*   **UFW Firewall:** Keep it enabled and only allow necessary ports.
*   **Regular Backups (Droplet Level):** Configure DigitalOcean Droplet backups for disaster recovery.
*   **Limit Sudo Access:** Use a non-root user for daily operations if possible.
*   **Monitor Logs:** For suspicious activity.
*   **Secure `config.json`:** If it contains sensitive information (though MarkSwift's default `config.json` doesn't), ensure its permissions are restrictive if not managed solely by root/Docker.

---

This maintenance guide should help you keep your MarkSwift deployment running smoothly and troubleshoot common problems.
