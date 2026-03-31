# Azure DevOps Pipeline Setup Guide

## Prerequisites

1. **Azure Subscription** with the following resources provisioned:
   - Azure Container Registry (ACR)
   - Azure App Service (Linux, container-based) or Azure Container Apps
   - Azure Database for PostgreSQL (Flexible Server)

2. **Azure DevOps Project** connected to the GitHub repository

---

## Step 1: Create Azure Resources

### Container Registry
```bash
az acr create --name synozuracr --resource-group <rg-name> --sku Basic
```

### App Service (Linux Container)
```bash
az appservice plan create --name synozur-plan --resource-group <rg-name> --is-linux --sku B1
az webapp create --name synozur-zenith-app --resource-group <rg-name> \
  --plan synozur-plan --deployment-container-image-name synozuracr.azurecr.io/synozur-zenith:latest
```

### PostgreSQL Flexible Server
```bash
az postgres flexible-server create --name synozur-db --resource-group <rg-name> \
  --sku-name Standard_B1ms --tier Burstable --version 16
```

---

## Step 2: Configure Azure DevOps

### Service Connection
1. Go to **Project Settings** > **Service connections**
2. Create a new **Azure Resource Manager** service connection
3. Select the subscription containing your resources
4. Note the connection name — this becomes the `azureSubscription` variable

### Pipeline Variables
Create a **Variable Group** (Pipelines > Library) named `synozur-zenith-vars` with:

| Variable | Example Value | Secret? |
|----------|--------------|---------|
| `azureSubscription` | `synozur-azure-connection` | No |
| `acrName` | `synozuracr` | No |
| `appServiceName` | `synozur-zenith-app` | No |
| `resourceGroupName` | `synozur-rg` | No |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/zenith` | **Yes** |

### App Service Configuration
Set these as **Application Settings** on the App Service:

| Setting | Description |
|---------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `TOKEN_ENCRYPTION_SECRET` | Min 32-char secret for encrypting client secrets at rest |
| `SESSION_SECRET` | Secret for Express session signing |
| `AZURE_CLIENT_ID` | Microsoft Entra app registration client ID |
| `AZURE_CLIENT_SECRET` | Microsoft Entra app registration secret |
| `AZURE_TENANT_ID` | Microsoft 365 tenant ID (or `common`) |
| `BASE_URL` | Public URL, e.g. `https://synozur-zenith-app.azurewebsites.net` |
| `PORT` | `8080` (matches Dockerfile EXPOSE) |
| `WEBSITES_PORT` | `8080` (tells App Service which port the container listens on) |

---

## Step 3: Create the Pipeline

1. Go to **Pipelines** > **New Pipeline**
2. Select **GitHub** as the source
3. Select the `chris-mcnulty/synozur-zenith` repository
4. Choose **Existing Azure Pipelines YAML file**
5. Select `/azure-pipelines.yml`
6. Link the variable group created above
7. Run the pipeline

---

## Step 4: Enable ACR Admin Access (for App Service)

```bash
az acr update --name synozuracr --admin-enabled true
az webapp config container set --name synozur-zenith-app --resource-group <rg-name> \
  --docker-registry-server-url https://synozuracr.azurecr.io \
  --docker-registry-server-user synozuracr \
  --docker-registry-server-password <acr-password>
```

---

## Health Check

The app exposes `GET /healthz` returning `{ "status": "ok" }`.

Configure this in App Service:
- **Settings** > **Health check** > Path: `/healthz`

---

## Pipeline Flow

```
PR to main  →  CI only (build + type-check, no deploy)
Merge to main →  CI + Docker build + push to ACR + DB migration + deploy to App Service
```

## Parallel Deployment (Replit)

This pipeline runs independently of the existing Replit deployment. Both use the
same codebase without conflicts:
- Replit uses `.replit` config and its own build/deploy mechanism
- Azure DevOps uses `azure-pipelines.yml`, `Dockerfile`, and Azure App Service
