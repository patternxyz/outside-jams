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

### Connect Spotify

Create an app in the Spotify developer dashboard and add this local redirect URI:

```text
http://127.0.0.1:5173/api/auth/spotify/callback
```

Set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env`. Generate the two
application secrets before starting the app:

```sh
openssl rand -base64 48 # SESSION_SECRET
openssl rand -base64 32 # TOKEN_ENCRYPTION_KEY
```

`API_BASE_URL` controls the OAuth callback origin. Leave it empty to use the
current request origin, which works through Vite's local proxy when the app is
opened at `http://127.0.0.1:5173`, or set it to a proxy/public origin such as
`https://example.test`. The exact resulting callback URI
(`${API_BASE_URL}/api/auth/spotify/callback`) must also be registered with Spotify.

Set `DB_RUN_MIGRATIONS=true` to create `public.users`, the PostgreSQL session
table, and the Spotify-specific tables under the `spotify` schema at startup.
Spotify tokens are encrypted in PostgreSQL, resolved through the server-side
session, and cached in a bounded in-process LRU. They are never sent to the SPA.

The read-only API includes:

- `GET /api/artists` and `GET /api/artists/:id`
- `GET /api/performances` and `GET /api/performances/:id`

Performance lists can be filtered with the `date`, `artistId`, `startTime`, and
`location` query parameters. Dates use `YYYY-MM-DD`; start times use an ISO 8601
timestamp. Filters can be combined.

API routes are rate limited per client. The default allows 100 requests per
60-second window and can be configured with `API_RATE_LIMIT` and
`API_RATE_LIMIT_TTL_MS`.

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
export CLOUD_RUN_SERVICE_ACCOUNT_NAME="app-runtime"
export CLOUD_TASKS_SERVICE_ACCOUNT_NAME="spotify-sync-task"
export CLOUD_TASKS_QUEUE="spotify-sync"
export WIF_POOL_ID="github-pool"
export WIF_PROVIDER_ID="github-provider"

./scripts/setup-gcp.sh
```

The script enables the required Google Cloud APIs, creates the Artifact Registry
repository and deployer service account when needed, grants its deployment roles,
creates the Spotify sync task queue and its runtime identities, and configures a
Workload Identity provider restricted to this repository's `dev` branch. The
deployment workflow grants the task caller `roles/run.invoker` after creating or
updating the service. Re-running the setup script is safe.

### 2. Configure the GitHub environment

Create an environment named `dev` in the GitHub repository under **Settings →
Environments**. Add the variables and secrets printed by `setup-gcp.sh` to that
environment, then add the application runtime settings listed below. Store the
database URL as a secret because it normally contains credentials.

Environment variables:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `ARTIFACT_REGISTRY_REPOSITORY`
- `CLOUD_RUN_SERVICE`
- `CLOUD_RUN_SERVICE_ACCOUNT_EMAIL`
- `CLOUD_TASKS_QUEUE`
- `CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL`
- `CLOUD_TASKS_AUDIENCE` (optional; defaults to `API_BASE_URL`)
- `DB_SSL`
- `DB_SYNCHRONIZE`
- `DB_RUN_MIGRATIONS`
- `API_RATE_LIMIT`
- `API_RATE_LIMIT_TTL_MS`
- `API_BASE_URL`
- `SPOTIFY_TOKEN_CACHE_SIZE`
- `SPOTIFY_TOKEN_CACHE_TTL_MS`

Environment secrets:

- `GCP_WIF_PROVIDER`
- `GCP_WIF_SERVICE_ACCOUNT`
- `DATABASE_URL`
- `SESSION_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

For Cloud Run, set `API_BASE_URL` to the service's public HTTPS origin and add
that origin's `/api/auth/spotify/callback` URI to the Spotify app. The deployment
workflow reads all four sensitive Spotify/session values from GitHub environment
secrets rather than embedding them in the image or workflow.

After Spotify OAuth succeeds, production enqueues an authenticated Cloud Task at
`POST ${API_BASE_URL}/api/internal/spotify/sync`. The task's OIDC identity is
checked by the application in addition to its Cloud Run IAM grant. In local
development (`NODE_ENV=development`), the same sync runs asynchronously in the
API process and does not require Google Cloud credentials.

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
