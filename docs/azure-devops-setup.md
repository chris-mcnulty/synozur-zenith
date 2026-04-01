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

## Schema Changes (Database Migrations)

When you add a column, table, or other schema change in Replit, here is how
that change flows through to Azure production.

### Two Migration Mechanisms

The app uses two complementary mechanisms for schema management:

| Mechanism | Source | When It Runs | What It Covers |
|-----------|--------|-------------|----------------|
| `drizzle-kit push` | `shared/schema.ts` | Pipeline CD stage, before deploy | All columns/tables defined in the Drizzle schema |
| `ensureTenantConnectionsSchema()` | `server/index.ts` | Every app startup | Additional columns/tables managed via raw SQL with `IF NOT EXISTS` guards |

Both are safe to run repeatedly — Drizzle compares the live DB to the schema
and only applies the diff, and the runtime ensures use `ADD COLUMN IF NOT EXISTS`
and `CREATE TABLE IF NOT EXISTS`.

### Developer Workflow

```
1. Edit shared/schema.ts in Replit        ← add your column here
2. Test in Replit dev                      ← works immediately (runtime ensures)
3. Commit + push to GitHub
4. Open PR → merge to main
5. Azure DevOps pipeline runs:
   a. CI: npm run build                   ← catches compile errors
   b. CI: npm run check                   ← catches type errors
   c. CD: drizzle-kit push                ← applies schema diff to Azure PostgreSQL
   d. CD: deploy new container            ← app boots, runtime ensures run as backup
6. Azure production now has the new column
```

### What Each Change Type Looks Like

#### Additive changes (safe, automatic)

Adding columns, tables, or indexes — these flow through automatically:

```typescript
// shared/schema.ts — add a new column
export const workspaces = pgTable("workspaces", {
  // ... existing columns ...
  newField: text("new_field"),               // ← just add this
});
```

Pipeline runs `drizzle-kit push` → detects the new column → runs
`ALTER TABLE workspaces ADD COLUMN new_field text` → done.

#### Destructive changes (require care)

Dropping columns, renaming columns, or changing types need manual attention
regardless of platform. These can break running code if the old container is
still serving requests while the schema changes.

For destructive changes, use a two-phase approach:

```
Phase 1: Deploy code that works with BOTH old and new schema
         (stop reading the old column, start reading the new one)
Phase 2: Deploy a migration that drops/renames the old column
```

This applies to both Replit and Azure — it's a general best practice, not
specific to the pipeline.

### Runtime-Managed Schema

Some columns and tables are managed by `ensureTenantConnectionsSchema()` in
`server/index.ts` via raw SQL rather than in `shared/schema.ts`. These include:

- `tenant_connections` feature flag columns (`data_masking_enabled`, etc.)
- `msp_access_grants` table
- `tenant_encryption_keys` table
- `tenant_access_grants` table
- `tenant_access_codes` table
- `page_views` table

These are applied on every app startup with `IF NOT EXISTS` guards, so they
work automatically in both Replit and Azure without any pipeline step. The
pipeline's `drizzle-kit push` step does not manage these — the running app does.

### Summary

| Change Type | How It Gets to Azure | Action Needed |
|-------------|---------------------|---------------|
| New column in `shared/schema.ts` | Pipeline runs `drizzle-kit push` | None — automatic |
| New table in `shared/schema.ts` | Pipeline runs `drizzle-kit push` | None — automatic |
| New column in `ensureTenantConnectionsSchema()` | App startup runs raw SQL | None — automatic |
| Drop/rename column | Must be done carefully | Two-phase deploy |
| Change column type | Must be done carefully | Two-phase deploy |

---

## Pipeline Flow

```
PR to main  →  CI only (build + type-check, no deploy)
Merge to main →  CI + Docker build + push to ACR + DB migration + deploy to App Service
```

---

## Custom Domains and SSL/TLS Certificates

By default each App Service gets a free `<app-name>.azurewebsites.net` domain
with a Microsoft-managed SSL certificate — no configuration required. To use
your own domains (e.g. `zenith.synozur.com`) with HTTPS, Azure provides free
managed certificates for each custom domain.

### How It Works Across Multiple Apps

Each app gets its own subdomain, CNAME record, and free managed certificate:

| App | Custom Domain | CNAME Target |
|-----|--------------|--------------|
| Zenith | `zenith.synozur.com` | `synozur-zenith.azurewebsites.net` |
| App 2 | `app2.synozur.com` | `synozur-app2.azurewebsites.net` |
| App 3 | `app3.synozur.com` | `synozur-app3.azurewebsites.net` |
| ... | ... | ... |

Azure issues and auto-renews a free SSL certificate per custom domain.
No wildcard cert purchase needed. No manual renewal.

### Step-by-Step: Add a Custom Domain to an App

This process is the same for every app. Repeat for each one.

**1. Add domain verification TXT record (does NOT affect live traffic):**

At your DNS registrar, add a TXT record to prove you own the domain:

| Type | Host | Value |
|------|------|-------|
| TXT | `asuid.zenith` | *(Azure provides this value in the next step)* |

**2. Add the custom domain in Azure Portal:**

1. Go to your App Service (e.g. `synozur-zenith`)
2. Left menu → **Settings** → **Custom domains**
3. Click **+ Add custom domain**
4. Domain: `zenith.synozur.com`
5. Hostname record type: **CNAME**
6. Azure displays the TXT verification value — add it to your DNS if you
   haven't already (from step 1)
7. Click **Validate** — Azure checks the TXT record
8. Click **Add**

**3. Bind the free managed certificate:**

1. Still on the **Custom domains** page, find `zenith.synozur.com`
2. The SSL State will show **Not Secure**
3. Click **Add binding**
4. Certificate source: **App Service Managed Certificate (Free)**
5. Click **Create** — Azure issues the cert (takes ~5 minutes)
6. TLS/SSL type: **SNI SSL**
7. Click **Add binding**

The domain now has HTTPS with an auto-renewing certificate.

**4. Switch DNS from Replit to Azure (the cutover):**

When you're ready to move live traffic, change the CNAME at your DNS registrar:

| Type | Host | Old Value (Replit) | New Value (Azure) |
|------|------|--------------------|-------------------|
| CNAME | `zenith` | `<replit-domain>` | `synozur-zenith.azurewebsites.net` |

DNS propagation takes 5–30 minutes depending on your TTL setting.

**5. Update BASE_URL in App Service settings:**

After cutover, update the environment variable:

```bash
az webapp config appsettings set --name synozur-zenith --resource-group synozur-rg \
  --settings BASE_URL="https://zenith.synozur.com"
```

**6. Force HTTPS (recommended):**

1. App Service → **Settings** → **Configuration** → **General settings**
2. Set **HTTPS Only** to **On**
3. Click **Save**

All HTTP requests will automatically redirect to HTTPS.

#### CLI Alternative

```bash
# Add custom domain
az webapp config hostname add \
  --webapp-name synozur-zenith \
  --resource-group synozur-rg \
  --hostname zenith.synozur.com

# Create free managed certificate
az webapp config ssl create \
  --name synozur-zenith \
  --resource-group synozur-rg \
  --hostname zenith.synozur.com

# Bind certificate (use the thumbprint from the previous command's output)
az webapp config ssl bind \
  --name synozur-zenith \
  --resource-group synozur-rg \
  --certificate-thumbprint <thumbprint> \
  --ssl-type SNI

# Force HTTPS
az webapp update \
  --name synozur-zenith \
  --resource-group synozur-rg \
  --https-only true
```

### Cost

Free managed certificates are included with App Service at no additional cost.
Each app gets its own certificate, issued and renewed automatically by Azure.

### Scaling to 8+ Apps — Azure Front Door (Optional Future Upgrade)

When running many apps, you may later want to centralize routing, SSL, and
add a Web Application Firewall (WAF). Azure Front Door provides this:

```
*.synozur.com → Azure Front Door → routes to individual App Services
                (single wildcard cert, WAF, CDN, global load balancing)
```

This is optional and costs ~$35/month. The free per-app managed certificates
work well and can be used indefinitely. Front Door is an upgrade path, not a
requirement.

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

6. Add a custom domain + free managed certificate (see Custom Domains section above)

The shared resources (ACR, plan, PG server, resource group) stay the same.

---

## Parallel Deployment (Replit)

This pipeline runs independently of the existing Replit deployment. Both use the
same codebase without conflicts:
- Replit uses `.replit` config and its own build/deploy mechanism
- Azure DevOps uses `azure-pipelines.yml`, `Dockerfile`, and Azure App Service
