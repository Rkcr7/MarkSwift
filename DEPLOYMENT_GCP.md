# MarkSwift Deployment Guide (Google Cloud Platform)

This guide provides instructions for deploying the MarkSwift application to Google Cloud Platform (GCP). The primary recommended method is using **Google Cloud Run** for its serverless, container-native approach. An alternative using **Google Compute Engine (GCE)** is also briefly covered for users preferring traditional VM management.

## Prerequisites

1.  **Google Cloud Platform Account:** You'll need an account with GCP. New users often get free credits.
2.  **Google Cloud SDK (`gcloud` CLI):** Installed and configured on your local machine. [Installation Guide](https://cloud.google.com/sdk/docs/install)
3.  **Git Repository:** Your MarkSwift application code hosted in a Git repository (e.g., GitHub, GitLab, Google Cloud Source Repositories).
    *   Ensure your `Dockerfile` and `config.json` are in the root of the repository.
4.  **Container Registry:** You'll need a place to store your Docker image. Google Container Registry (GCR) or Artifact Registry are recommended.
5.  **Billing Enabled:** Ensure billing is enabled for your GCP project. Cloud Run has a generous free tier, but a billing account is required.

## Method 1: Deploying to Google Cloud Run (Recommended)

Cloud Run is a managed compute platform that enables you to run stateless containers that are invocable via HTTP requests. It's ideal for applications like MarkSwift.

### Phase 1: Prepare Your Application and Docker Image

1.  **Ensure `Dockerfile` is Ready:**
    The `Dockerfile` created previously for DigitalOcean should work well. Key aspects:
    *   It installs Node.js and Puppeteer dependencies.
    *   It exposes the correct port (e.g., 3000, as defined in your `config.json` or `PORT` environment variable). Cloud Run will use the `PORT` environment variable.

2.  **Application Listens to `PORT` Environment Variable:**
    Your `server/server.js` file should already be configured to use `process.env.PORT || config.port`. Cloud Run automatically sets the `PORT` environment variable (typically 8080 for the container, but your app should listen to whatever `PORT` is provided). Your `Dockerfile` `EXPOSE 3000` is fine; Cloud Run handles the mapping.

3.  **Build and Push Docker Image to Google Container Registry (GCR) or Artifact Registry:**

    *   **Enable APIs:** Ensure "Cloud Build API", "Container Registry API" or "Artifact Registry API" are enabled in your GCP project.
    *   **Authenticate Docker:**
        ```bash
        gcloud auth configure-docker
        # For specific regions if not gcr.io (e.g., us-central1-docker.pkg.dev)
        # gcloud auth configure-docker us-central1-docker.pkg.dev 
        ```
    *   **Tag your image:**
        Replace `[PROJECT-ID]` with your GCP Project ID and `markswift-gcp` with your desired image name.
        ```bash
        # Using Google Container Registry (gcr.io)
        docker build -t gcr.io/[PROJECT-ID]/markswift-gcp:latest . 
        # Or using Artifact Registry (e.g., us-central1-docker.pkg.dev)
        # docker build -t us-central1-docker.pkg.dev/[PROJECT-ID]/markswift-repo/markswift-gcp:latest .
        ```
    *   **Push your image:**
        ```bash
        # Using Google Container Registry
        docker push gcr.io/[PROJECT-ID]/markswift-gcp:latest
        # Or using Artifact Registry
        # docker push us-central1-docker.pkg.dev/[PROJECT-ID]/markswift-repo/markswift-gcp:latest
        ```
    *   **Alternative: Using Cloud Build:**
        You can submit your build directly to Cloud Build, which will build and push the image for you. Create a `cloudbuild.yaml` file in your repository root:
        ```yaml
        steps:
        - name: 'gcr.io/cloud-builders/docker'
          args: ['build', '-t', 'gcr.io/[PROJECT-ID]/markswift-gcp:latest', '.']
        images:
        - 'gcr.io/[PROJECT-ID]/markswift-gcp:latest'
        ```
        Then run:
        ```bash
        gcloud builds submit --config cloudbuild.yaml .
        ```

### Phase 2: Deploy to Cloud Run

1.  **Deploy using `gcloud` CLI:**
    Replace `[PROJECT-ID]` and image path accordingly.
    ```bash
    gcloud run deploy markswift-service \
        --image gcr.io/[PROJECT-ID]/markswift-gcp:latest \
        --platform managed \
        --region [YOUR_PREFERRED_REGION] \
        --allow-unauthenticated \
        --port 3000 \
        --cpu 1 \
        --memory 2Gi \
        --concurrency 10 \
        --timeout 600 \
        --set-env-vars "NODE_ENV=production" 
        # Add any other environment variables your app needs, e.g., from config.json if not bundling it
    ```
    **Explanation of Flags:**
    *   `markswift-service`: Name of your Cloud Run service.
    *   `--image`: Path to your image in GCR or Artifact Registry.
    *   `--platform managed`: Use the fully managed Cloud Run environment.
    *   `--region`: GCP region (e.g., `us-central1`, `europe-west1`).
    *   `--allow-unauthenticated`: Allows public access. For private services, configure IAM.
    *   `--port 3000`: Tells Cloud Run that your container listens on port 3000 (matches `EXPOSE` in Dockerfile and your app's listening port). Cloud Run will still expose the service on HTTPS (port 443).
    *   `--cpu 1`: Number of vCPUs. Puppeteer benefits from CPU. Max is 8 for Gen2.
    *   `--memory 2Gi`: Memory allocated. Puppeteer needs significant memory. Max is 32Gi for Gen2.
    *   `--concurrency 10`: Max concurrent requests per container instance. Adjust based on your `config.json`'s `max` concurrency and instance resources. If one instance has 2Gi RAM and 1 CPU, and your app's `max` concurrency is 10, this means one instance *tries* to handle 10. Cloud Run will scale instances based on this.
    *   `--timeout 600`: Request timeout in seconds (max 3600). PDF conversion can take time.
    *   `--set-env-vars`: Set environment variables. `NODE_ENV=production` is good practice.

2.  **Persistent Storage for `config.json` and Temporary Files:**
    *   **`config.json`:** The best practice is to bake `config.json` into your Docker image or manage its settings via environment variables passed to Cloud Run.
    *   **Temporary Files (`uploads`, `converted-pdfs`, `zips`):** Cloud Run instances have an in-memory filesystem for temporary files. This is usually sufficient for MarkSwift's temporary needs, as files are cleaned up.
        *   **Important:** The in-memory filesystem is limited by the instance's memory. For very large files or high concurrency leading to many temporary files, this could be an issue.
        *   **Alternative for Persistent/Larger Temp Storage:** If needed, you can mount a Google Cloud Filestore instance (NFS) or use Google Cloud Storage (GCS) buckets for temporary file handling, but this adds complexity. For most cases, the in-memory filesystem should work if instance memory is adequate (e.g., 2Gi+).

3.  **WebSocket Support:**
    Cloud Run supports WebSockets. Ensure your client-side code connects to the Cloud Run service URL using `wss://`.

4.  **Custom Domain (Optional):**
    After deployment, you can map a custom domain to your Cloud Run service through the GCP console (Cloud Run -> Custom Domains).

### Phase 3: Updating the Service

1.  **Build and push a new Docker image version:**
    ```bash
    docker build -t gcr.io/[PROJECT-ID]/markswift-gcp:v2 . # Tag with a new version
    docker push gcr.io/[PROJECT-ID]/markswift-gcp:v2
    ```
2.  **Deploy the new revision:**
    Run the `gcloud run deploy` command again, pointing to the new image tag. Cloud Run will create a new revision and gradually shift traffic.
    ```bash
    gcloud run deploy markswift-service \
        --image gcr.io/[PROJECT-ID]/markswift-gcp:v2 \
        --platform managed \
        --region [YOUR_PREFERRED_REGION] 
        # ... other flags as before ...
    ```

## Method 2: Deploying to Google Compute Engine (GCE)

This method is similar to deploying on a DigitalOcean Droplet, giving you full VM control.

1.  **Create a GCE VM Instance:**
    *   Choose an OS (e.g., Ubuntu 22.04 LTS).
    *   Select machine type (e.g., `e2-medium` or `e2-standard-2` for 2 vCPUs, 4GB RAM).
    *   Configure firewall rules to allow HTTP (80), HTTPS (443), and SSH (22).

2.  **Follow DigitalOcean Droplet Guide:**
    The steps for setting up the server, installing Docker, deploying the application using your scripts (`scripts/setup-server.sh`, `scripts/deploy.sh`), configuring Nginx, and setting up SSL with Certbot are **largely identical** to the `DEPLOYMENT_DO.md` guide.
    *   You'll SSH into your GCE instance.
    *   Run `setup-server.sh`.
    *   Clone your repo and run `deploy.sh`.
    *   Set up Nginx and Certbot.

**Key Differences for GCE vs. DigitalOcean Droplet:**
*   Firewall configuration is done via GCP Console or `gcloud` commands.
*   Static IP address assignment might differ slightly.
*   Pricing and machine type options.

## Choosing Between Cloud Run and GCE

*   **Cloud Run:**
    *   **Pros:** Serverless (no VM management), auto-scaling, pay-per-use, simpler deployment for containerized apps, integrated HTTPS.
    *   **Cons:** Stateless (temporary file handling needs consideration for very large scale), limited control over underlying infrastructure.
    *   **Best for:** Most web applications, microservices, APIs. **Generally recommended for MarkSwift due to ease of use and scalability.**

*   **Google Compute Engine (GCE):**
    *   **Pros:** Full control over VM, persistent disk for any storage need, suitable for any type of workload.
    *   **Cons:** Requires manual server management, patching, security configuration.
    *   **Best for:** Applications requiring specific OS configurations, long-running background tasks not suited for serverless, or when full control is paramount.

## Final Steps for Both Methods

*   **Testing:** Thoroughly test file uploads, conversions in different modes, and downloads.
*   **Monitoring:** Use Google Cloud's operations suite (Cloud Monitoring, Cloud Logging) to monitor your application.
*   **Cost Management:** Keep an eye on your GCP billing, especially if using GCE or higher-tier Cloud Run configurations.

This guide provides a starting point for deploying MarkSwift to GCP. Refer to official Google Cloud documentation for more in-depth information on each service.
