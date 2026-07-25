# Basic Monorepo for Single Page Apps

Minimal npm-workspace monorepo with a Vite React SPA and a NestJS/Express API backed by PostgreSQL through TypeORM.

## Development

Requires Node.js 22.13 or newer and a reachable PostgreSQL database.

```sh
nvm use
cp .env.example .env
npm install
npm run dev
```

The SPA runs at `http://localhost:5173` and proxies `/api` to the API at `http://localhost:3000`.

## Production

```sh
npm run build
npm start
```

Or build and run the container:

```sh
docker build -t basic-spa .
docker run --env-file .env -p 3000:3000 basic-spa
```

Set `DB_SYNCHRONIZE=true` only for local prototyping. Use migrations in production.

## Deploy to Google Cloud Run

Deployments use GitHub Actions and Google Cloud Workload Identity Federation, so
GitHub does not need a long-lived service-account key. A push to the `dev` branch
runs `.github/workflows/build.yml`, which builds and publishes the container to
Artifact Registry and then calls `.github/workflows/deploy.yml` to deploy that
immutable image to Cloud Run.

### 1. Configure Google Cloud

Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install), log in,
and make sure your account can enable APIs and manage Artifact Registry, IAM,
service accounts, Workload Identity Federation, and Cloud Run in the target
project:

```sh
gcloud auth login
```

Set the deployment values, then run the setup script from the repository root:

```sh
export GCP_PROJECT_ID="your-project-id"
export GCP_REGION="us-central1"
export ARTIFACT_REGISTRY_REPOSITORY="basic-spa"
export CLOUD_RUN_SERVICE="basic-spa"
export GITHUB_OWNER="your-github-owner"
export GITHUB_REPOSITORY="template-basic-spa"
export GITHUB_BRANCH="dev"
export DEPLOY_SERVICE_ACCOUNT_NAME="github-actions-deployer"
export WIF_POOL_ID="github-pool"
export WIF_PROVIDER_ID="github-provider"

./scripts/setup-gcp.sh
```

The script enables the required Google Cloud APIs, creates the Artifact Registry
repository and deployer service account when needed, grants its deployment roles,
and configures a Workload Identity provider restricted to this repository's
`dev` branch. Re-running it with the same values is safe.

### 2. Configure the GitHub environment

Create an environment named `dev` in the GitHub repository under **Settings →
Environments**. Add the variables and secrets printed by `setup-gcp.sh` to that
environment.

Environment variables:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `ARTIFACT_REGISTRY_REPOSITORY`
- `CLOUD_RUN_SERVICE`

Environment secrets:

- `GCP_WIF_PROVIDER`
- `GCP_WIF_SERVICE_ACCOUNT`

The script also prints ready-to-run `gh variable set` and `gh secret set`
commands. If using those commands, first install and authenticate the GitHub CLI:

```sh
gh auth login
```

### 3. Run a deployment

Commit the workflow files and push the application changes to `dev`:

```sh
git switch dev
git add .github/workflows README.md scripts/setup-gcp.sh
git commit -m "Configure Cloud Run deployment"
git push origin dev
```

The push starts the **Build** workflow. Follow it in the repository's **Actions**
tab or with the GitHub CLI:

```sh
gh run list --workflow Build
gh run watch
```

The `deploy.yml` workflow is reusable and is invoked by the Build workflow; it is
not run directly. To retry a failed run after correcting its configuration, use
the **Re-run jobs** control in GitHub Actions or run:

```sh
gh run rerun RUN_ID --failed
```

When deployment succeeds, the workflow summary links to the deployed Cloud Run
service URL.
