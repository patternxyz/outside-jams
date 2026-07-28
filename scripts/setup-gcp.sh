#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID before running this script}"
: "${GCP_REGION:?Set GCP_REGION before running this script}"
: "${ARTIFACT_REGISTRY_REPOSITORY:?Set ARTIFACT_REGISTRY_REPOSITORY before running this script}"
: "${CLOUD_RUN_SERVICE:?Set CLOUD_RUN_SERVICE before running this script}"
: "${GITHUB_OWNER:?Set GITHUB_OWNER before running this script}"
: "${GITHUB_REPOSITORY:?Set GITHUB_REPOSITORY before running this script}"
: "${GITHUB_BRANCH:?Set GITHUB_BRANCH before running this script}"
: "${DEPLOY_SERVICE_ACCOUNT_NAME:?Set DEPLOY_SERVICE_ACCOUNT_NAME before running this script}"
: "${CLOUD_RUN_SERVICE_ACCOUNT_NAME:?Set CLOUD_RUN_SERVICE_ACCOUNT_NAME before running this script}"
: "${CLOUD_TASKS_SERVICE_ACCOUNT_NAME:?Set CLOUD_TASKS_SERVICE_ACCOUNT_NAME before running this script}"
: "${CLOUD_TASKS_QUEUE:?Set CLOUD_TASKS_QUEUE before running this script}"
: "${WIF_POOL_ID:?Set WIF_POOL_ID before running this script}"
: "${WIF_PROVIDER_ID:?Set WIF_PROVIDER_ID before running this script}"

DEPLOY_SERVICE_ACCOUNT_EMAIL="${DEPLOY_SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
CLOUD_RUN_SERVICE_ACCOUNT_EMAIL="${CLOUD_RUN_SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL="${CLOUD_TASKS_SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
GITHUB_REPOSITORY_FULL_NAME="${GITHUB_OWNER}/${GITHUB_REPOSITORY}"

retry() {
  local max_attempts="$1"
  local delay_seconds="$2"
  local attempt=1
  shift 2

  until "$@"; do
    if ((attempt >= max_attempts)); then
      echo "Command failed after ${max_attempts} attempts: $*" >&2
      return 1
    fi

    echo "GCP resource is not ready yet; retrying in ${delay_seconds}s (${attempt}/${max_attempts})..." >&2
    sleep "${delay_seconds}"
    attempt=$((attempt + 1))
  done
}

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required: https://cloud.google.com/sdk/docs/install" >&2
  exit 1
}

gcloud config set project "${GCP_PROJECT_ID}"

gcloud services enable \
  artifactregistry.googleapis.com \
  cloudtasks.googleapis.com \
  run.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  --project "${GCP_PROJECT_ID}"

if ! gcloud artifacts repositories describe "${ARTIFACT_REGISTRY_REPOSITORY}" \
  --location "${GCP_REGION}" \
  --project "${GCP_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${ARTIFACT_REGISTRY_REPOSITORY}" \
    --repository-format docker \
    --location "${GCP_REGION}" \
    --description "Pattern X container images" \
    --project "${GCP_PROJECT_ID}"
fi

if ! gcloud iam service-accounts describe "${DEPLOY_SERVICE_ACCOUNT_EMAIL}" \
  --project "${GCP_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${DEPLOY_SERVICE_ACCOUNT_NAME}" \
    --display-name "GitHub Actions deployer" \
    --project "${GCP_PROJECT_ID}"
fi

if ! gcloud iam service-accounts describe "${CLOUD_RUN_SERVICE_ACCOUNT_EMAIL}" \
  --project "${GCP_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${CLOUD_RUN_SERVICE_ACCOUNT_NAME}" \
    --display-name "Outside Jams Cloud Run runtime" \
    --project "${GCP_PROJECT_ID}"
fi

if ! gcloud iam service-accounts describe "${CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL}" \
  --project "${GCP_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${CLOUD_TASKS_SERVICE_ACCOUNT_NAME}" \
    --display-name "Spotify sync task caller" \
    --project "${GCP_PROJECT_ID}"
fi

# Newly created service accounts can take a short time to propagate to the IAM
# APIs even after the create command succeeds.
retry 12 5 gcloud iam service-accounts describe "${DEPLOY_SERVICE_ACCOUNT_EMAIL}" \
  --project "${GCP_PROJECT_ID}" >/dev/null

for role in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/iam.serviceAccountUser; do
  retry 12 5 gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member "serviceAccount:${DEPLOY_SERVICE_ACCOUNT_EMAIL}" \
    --role "${role}" \
    --condition None \
    --quiet
done

retry 12 5 gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
  --member "serviceAccount:${CLOUD_RUN_SERVICE_ACCOUNT_EMAIL}" \
  --role roles/cloudtasks.enqueuer \
  --condition None \
  --quiet

retry 12 5 gcloud iam service-accounts add-iam-policy-binding \
  "${CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL}" \
  --project "${GCP_PROJECT_ID}" \
  --member "serviceAccount:${CLOUD_RUN_SERVICE_ACCOUNT_EMAIL}" \
  --role roles/iam.serviceAccountUser \
  --condition None \
  --quiet

if ! gcloud tasks queues describe "${CLOUD_TASKS_QUEUE}" \
  --location "${GCP_REGION}" \
  --project "${GCP_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud tasks queues create "${CLOUD_TASKS_QUEUE}" \
    --location "${GCP_REGION}" \
    --project "${GCP_PROJECT_ID}"
fi

if gcloud run services describe "${CLOUD_RUN_SERVICE}" \
  --region "${GCP_REGION}" \
  --project "${GCP_PROJECT_ID}" >/dev/null 2>&1; then
  retry 12 5 gcloud run services add-iam-policy-binding "${CLOUD_RUN_SERVICE}" \
    --region "${GCP_REGION}" \
    --project "${GCP_PROJECT_ID}" \
    --member "serviceAccount:${CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL}" \
    --role roles/run.invoker \
    --quiet
else
  echo "Cloud Run service does not exist yet; the deployment workflow will grant the task caller roles/run.invoker after creating it." >&2
fi

PROJECT_NUMBER="$(gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectNumber)')"

if ! gcloud iam workload-identity-pools describe "${WIF_POOL_ID}" \
  --project "${GCP_PROJECT_ID}" \
  --location global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "${WIF_POOL_ID}" \
    --project "${GCP_PROJECT_ID}" \
    --location global \
    --display-name "GitHub Actions"
fi

if ! gcloud iam workload-identity-pools providers describe "${WIF_PROVIDER_ID}" \
  --project "${GCP_PROJECT_ID}" \
  --location global \
  --workload-identity-pool "${WIF_POOL_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "${WIF_PROVIDER_ID}" \
    --project "${GCP_PROJECT_ID}" \
    --location global \
    --workload-identity-pool "${WIF_POOL_ID}" \
    --display-name "GitHub ${GITHUB_REPOSITORY_FULL_NAME}" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository=='${GITHUB_REPOSITORY_FULL_NAME}' && assertion.ref=='refs/heads/${GITHUB_BRANCH}'"
fi

retry 12 5 gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SERVICE_ACCOUNT_EMAIL}" \
  --project "${GCP_PROJECT_ID}" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL_ID}/attribute.repository/${GITHUB_REPOSITORY_FULL_NAME}" \
  --condition None \
  --quiet

WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL_ID}/providers/${WIF_PROVIDER_ID}"

echo
echo "GCP setup complete."
echo "Cloud Run service: ${CLOUD_RUN_SERVICE} (${GCP_REGION})"
echo "Artifact Registry: ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REGISTRY_REPOSITORY}"
echo
echo "Set these GitHub dev environment variables:"
echo "  GCP_PROJECT_ID=${GCP_PROJECT_ID}"
echo "  GCP_REGION=${GCP_REGION}"
echo "  ARTIFACT_REGISTRY_REPOSITORY=${ARTIFACT_REGISTRY_REPOSITORY}"
echo "  CLOUD_RUN_SERVICE=${CLOUD_RUN_SERVICE}"
echo "  CLOUD_RUN_SERVICE_ACCOUNT_EMAIL=${CLOUD_RUN_SERVICE_ACCOUNT_EMAIL}"
echo "  CLOUD_TASKS_QUEUE=${CLOUD_TASKS_QUEUE}"
echo "  CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL=${CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL}"
echo
echo "Set these GitHub dev environment secrets:"
echo "  GCP_WIF_PROVIDER=${WIF_PROVIDER}"
echo "  GCP_WIF_SERVICE_ACCOUNT=${DEPLOY_SERVICE_ACCOUNT_EMAIL}"
echo
echo "With GitHub CLI installed and authenticated, run:"
echo "  gh variable set GCP_PROJECT_ID --env dev --body '${GCP_PROJECT_ID}'"
echo "  gh variable set GCP_REGION --env dev --body '${GCP_REGION}'"
echo "  gh variable set ARTIFACT_REGISTRY_REPOSITORY --env dev --body '${ARTIFACT_REGISTRY_REPOSITORY}'"
echo "  gh variable set CLOUD_RUN_SERVICE --env dev --body '${CLOUD_RUN_SERVICE}'"
echo "  gh variable set CLOUD_RUN_SERVICE_ACCOUNT_EMAIL --env dev --body '${CLOUD_RUN_SERVICE_ACCOUNT_EMAIL}'"
echo "  gh variable set CLOUD_TASKS_QUEUE --env dev --body '${CLOUD_TASKS_QUEUE}'"
echo "  gh variable set CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL --env dev --body '${CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL}'"
echo "  gh secret set GCP_WIF_PROVIDER --env dev --body '${WIF_PROVIDER}'"
echo "  gh secret set GCP_WIF_SERVICE_ACCOUNT --env dev --body '${DEPLOY_SERVICE_ACCOUNT_EMAIL}'"
