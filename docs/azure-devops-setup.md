# Azure DevOps Pipeline Setup Guide

## Naming Conventions

This setup uses a shared-infrastructure model so multiple Synozur apps
can share common Azure resources and minimise cost.

### Shared resources (one per environment)

| Resource | Name | Shared by |
|----------|------|-----------|
| Resource Group | `synozur-rg` | All Synozur apps |
| App Service Plan | `synozur-plan` | All web apps (one plan, many apps) |
| Container Registry | `synozuracr` | All Docker images (one repo per app) |
| PostgreSQL Server | `synozur-db` | All databases (one DB per app) |

### Per-app resources

| Resource | Zenith | Next App |
|----------|--------|----------|
| Web App | `synozur-zenith` | `synozur-<app-name>` |
| Database | `zenith` | `<app-name>` |
| ACR Image | `synozur-zenith` | `synozur-<app-name>` |
| Variable Group | `synozur-zenith-vars` | `synozur-<app-name>-vars` |

---

## Prerequisites

1. **Azure Subscription** with the following resources provisioned:
   - Azure Container Registry (ACR)
   - Azure App Service Plan (Linux)
   - Azure Database for PostgreSQL (Flexible Server)

2. **Azure DevOps Project** connected to the GitHub repository

---

## Step 1: Create Shared Azure Resources

These are created **once** and reused across all apps.

### Resource Group
```bash
az group create --name synozur-rg --location eastus2
```

### Container Registry
```bash
az acr create --name synozuracr --resource-group synozur-rg --sku Basic --admin-enabled true
```

### App Service Plan
```bash
az appservice plan create --name synozur-plan --resource-group synozur-rg --is-linux --sku B1
```

### PostgreSQL Flexible Server
```bash
az postgres flexible-server create \
  --name synozur-db \
  --resource-group synozur-rg \
  --location eastus2 \
  --admin-user synozur_admin \
  --admin-password '<your-password>' \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 16 \
  --storage-size 32 \
  --public-access 0.0.0.0
```

---

## Step 2: Create Zenith-Specific Resources

### Database
```bash
az postgres flexible-server db create \
  --resource-group synozur-rg \
  --server-name synozur-db \
  --database-name zenith
```

Your `DATABASE_URL`:
```
postgresql://synozur_admin:<password>@synozur-db.postgres.database.azure.com:5432/zenith?sslmode=require
```

### Web App
```bash
az webapp create \
  --name synozur-zenith \
  --resource-group synozur-rg \
  --plan synozur-plan \
  --container-image-name synozuracr.azurecr.io/synozur-zenith:latest \
  --container-registry-url https://synozuracr.azurecr.io \
  --container-registry-user synozuracr \
  --container-registry-password '<acr-password>'
```

### App Service Configuration (Environment Variables)

```bash
az webapp config appsettings set \
  --name synozur-zenith \
  --resource-group synozur-rg \
  --settings \
    DATABASE_URL="postgresql://synozur_admin:<pw>@synozur-db.postgres.database.azure.com:5432/zenith?sslmode=require" \
    TOKEN_ENCRYPTION_SECRET="$(openssl rand -hex 32)" \
    SESSION_SECRET="$(openssl rand -hex 32)" \
    AZURE_CLIENT_ID="<your-entra-client-id>" \
    AZURE_CLIENT_SECRET="<your-entra-client-secret>" \
    AZURE_TENANT_ID="<your-tenant-id>" \
    BASE_URL="https://synozur-zenith.azurewebsites.net" \
    PORT=8080 \
    WEBSITES_PORT=8080 \
    NODE_ENV=production
```

| Setting | Description |
|---------|-------------|
| `DATABASE_URL` | PostgreSQL connection string for the `zenith` database |
| `TOKEN_ENCRYPTION_SECRET` | Min 32-char secret for encrypting client secrets at rest |
| `SESSION_SECRET` | Secret for Express session signing |
| `AZURE_CLIENT_ID` | Microsoft Entra app registration client ID |
| `AZURE_CLIENT_SECRET` | Microsoft Entra app registration secret |
| `AZURE_TENANT_ID` | Microsoft 365 tenant ID (or `common`) |
| `BASE_URL` | Public URL, e.g. `https://synozur-zenith.azurewebsites.net` |
| `PORT` | `8080` (matches Dockerfile EXPOSE) |
| `WEBSITES_PORT` | `8080` (tells App Service which port the container listens on) |

### Health Check

1. Go to App Service → **Monitoring** → **Health check**
2. Toggle **Enable**, path: `/healthz`
3. Click **Save**

---

## Step 3: Configure Azure DevOps

### Service Connection (GitHub)
1. **Project Settings** → **Service connections** → **New** → **GitHub**
2. Authorize and name it `github-connection`

### Service Connection (Azure)
1. **Project Settings** → **Service connections** → **New** → **Azure Resource Manager**
2. Select **Service principal (automatic)**
3. Scope to subscription + `synozur-rg`
4. Name: `synozur-azure-connection`
5. Check **Grant access permission to all pipelines**

### Shared Variable Group

Create a variable group named `synozur-shared-vars` in **Pipelines** → **Library**:

| Variable | Value | Secret? |
|----------|-------|---------|
| `azureSubscription` | `synozur-azure-connection` | No |
| `acrName` | `synozuracr` | No |
| `resourceGroupName` | `synozur-rg` | No |

This group is linked to **every** Synozur app pipeline.

### App-Specific Variable Group

Create a variable group named `synozur-zenith-vars`:

| Variable | Value | Secret? |
|----------|-------|---------|
| `appServiceName` | `synozur-zenith` | No |
| `DATABASE_URL` | `postgresql://synozur_admin:...` | **Yes** |

Each additional app gets its own `synozur-<app>-vars` group.

---

## Step 4: Create the Pipeline

1. **Pipelines** → **New pipeline** → **GitHub**
2. Select `chris-mcnulty/synozur-zenith`
3. Choose **Existing Azure Pipelines YAML file** → `/azure-pipelines.yml`
4. Click **Variables** → **Variable groups**:
   - Link `synozur-shared-vars`
   - Link `synozur-zenith-vars`
5. Click **Run**

---

## Step 5: Enable ACR Admin Access (for App Service)

```bash
az acr update --name synozuracr --admin-enabled true
az webapp config container set --name synozur-zenith --resource-group synozur-rg \
  --docker-registry-server-url https://synozuracr.azurecr.io \
  --docker-registry-server-user synozuracr \
  --docker-registry-server-password '<acr-password>'
```

---

## Pipeline Flow

```
PR to main  →  CI only (build + type-check, no deploy)
Merge to main →  CI + Docker build + push to ACR + DB migration + deploy to App Service
```

---

## Adding a New App

To add another Synozur app to this infrastructure:

1. Create a new database on the shared PG server:
   ```bash
   az postgres flexible-server db create --resource-group synozur-rg \
     --server-name synozur-db --database-name <app-name>
   ```

2. Create a new Web App on the shared plan:
   ```bash
   az webapp create --name synozur-<app-name> --resource-group synozur-rg \
     --plan synozur-plan \
     --container-image-name synozuracr.azurecr.io/synozur-<app-name>:latest
   ```

3. Create an app-specific variable group `synozur-<app-name>-vars`

4. Add an `azure-pipelines.yml` to the new repo, linking both
   `synozur-shared-vars` and `synozur-<app-name>-vars`

5. Configure App Service settings (env vars) for the new app

The shared resources (ACR, plan, PG server, resource group) stay the same.

---

## Parallel Deployment (Replit)

This pipeline runs independently of the existing Replit deployment. Both use the
same codebase without conflicts:
- Replit uses `.replit` config and its own build/deploy mechanism
- Azure DevOps uses `azure-pipelines.yml`, `Dockerfile`, and Azure App Service
