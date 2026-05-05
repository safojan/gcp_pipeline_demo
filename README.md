# GCP Pipeline Demo

A Node.js application demonstrating Google Cloud Platform's CI/CD pipeline using Cloud Build, Cloud Run, Cloud SQL, and Cloud Secrets.

## Architecture

- **Cloud Build**: Automated builds triggered by GitHub commits
- **Cloud Run**: Serverless container deployment
- **Cloud SQL**: PostgreSQL database for storing visit data
- **Cloud Secrets**: Secure storage for database credentials

## Setup Instructions

### 1. Prerequisites

- Google Cloud Project with billing enabled
- GitHub repository
- gcloud CLI installed

### 2. Enable Required APIs

```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### 3. Create Cloud SQL Instance

```bash
gcloud sql instances create gcp-demo-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

gcloud sql databases create visits_db --instance=gcp-demo-db

gcloud sql users create dbuser \
  --instance=gcp-demo-db \
  --password=YOUR_SECURE_PASSWORD
```

### 4. Store Database Credentials in Secret Manager

Create a JSON file with database credentials:

```json
{
  "username": "dbuser",
  "password": "YOUR_SECURE_PASSWORD",
  "database": "visits_db",
  "port": 5432
}
```

Store it in Secret Manager:

```bash
gcloud secrets create db-credentials \
  --data-file=db-credentials.json

gcloud secrets add-iam-policy-binding db-credentials \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 5. Update cloudbuild.yaml

Replace `YOUR_PROJECT_ID` and `YOUR_INSTANCE_NAME` in `cloudbuild.yaml`:

```yaml
substitutions:
  _INSTANCE_CONNECTION_NAME: 'your-project-id:us-central1:gcp-demo-db'
```

### 6. Connect GitHub Repository to Cloud Build

```bash
# Connect your GitHub repository
gcloud builds triggers create github \
  --repo-name=YOUR_REPO_NAME \
  --repo-owner=YOUR_GITHUB_USERNAME \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml
```

Or use the Cloud Console:
1. Go to Cloud Build > Triggers
2. Click "Connect Repository"
3. Select GitHub and authenticate
4. Choose your repository
5. Create a trigger with `cloudbuild.yaml`

### 7. Grant Cloud Build Permissions

```bash
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')

gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### 8. Deploy

Push to GitHub main branch:

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

Cloud Build will automatically:
1. Build the Docker container
2. Push to Container Registry
3. Deploy to Cloud Run

## API Endpoints

- `GET /` - Main endpoint showing service status and visit count
- `GET /health` - Health check endpoint
- `GET /api/visits` - Get recent visit history

## Environment Variables

The app uses these environment variables (set automatically by Cloud Run):

- `PORT` - Server port (default: 8080)
- `DB_SECRET_NAME` - Secret Manager secret name for database credentials
- `INSTANCE_CONNECTION_NAME` - Cloud SQL instance connection name
- `NODE_ENV` - Environment (production/development)

## Local Development

```bash
npm install
npm run dev
```

Note: Local development requires setting up Cloud SQL Proxy for database access.

## Monitoring

View logs in Cloud Console:
- Cloud Build: Build history and logs
- Cloud Run: Application logs and metrics
- Cloud SQL: Database performance

## Cost Optimization

- Cloud Run: Pay per request (free tier available)
- Cloud SQL: db-f1-micro tier for testing
- Cloud Build: 120 build-minutes/day free
- Secret Manager: First 6 secret versions free

## Troubleshooting

**Build fails**: Check Cloud Build logs in GCP Console
**Database connection fails**: Verify Secret Manager permissions and Cloud SQL instance name
**Deployment fails**: Ensure Cloud Run API is enabled and service account has proper permissions
