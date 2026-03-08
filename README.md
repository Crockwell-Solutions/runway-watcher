# Runway Watcher

Airport runway hazard detection and monitoring system. Provides a real-time dashboard for tracking hazards (birds, drones, debris, vehicles) detected by cameras positioned around an airport.

![React](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue) ![AWS CDK](https://img.shields.io/badge/AWS_CDK-v2-orange) ![Vite](https://img.shields.io/badge/Vite-7-purple) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-blue)

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  CloudFront  │────▶│  S3 (Static  │     │  API Gateway    │
│  Distribution│     │   Hosting)   │     │  (REST API)     │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    │              │              │
                              ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
                              │ get-latest │ │ get-alerts│ │  upload-  │
                              │  -images   │ │           │ │  images   │
                              └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                                    │              │              │
                              ┌─────▼──────────────▼──────────────▼─────┐
                              │              DynamoDB                    │
                              │         (Single-Table Design)           │
                              └─────────────────┬───────────────────────┘
                                                │ Streams
                                          ┌─────▼─────┐
                                          │  analyse-  │
                                          │   hazard   │
                                          │ (Durable)  │
                                          └──┬─────┬───┘
                                             │     │
                                    ┌────────▼┐  ┌─▼──────────┐
                                    │Rekognit-│  │  Bedrock    │
                                    │  ion    │  │   Agent     │
                                    └─────────┘  └─────────────┘

  EventBridge (1-min schedule)──▶ upload-images ──▶ S3 (Camera Images)
  EventBridge (S3 Object Created)──▶ process-image ──▶ DynamoDB
```

### How It Works

1. **Image ingestion** — An EventBridge rule triggers the `upload-images` Lambda every minute, which uploads sample camera images to S3 with configurable per-camera probability.
2. **Image processing** — S3 object creation events (via EventBridge) trigger `process-image`, which writes latest-image metadata to DynamoDB with `PK=LATEST`.
3. **Hazard analysis** — DynamoDB Streams triggers the `analyse-hazard` durable Lambda when a `LATEST` record is inserted/modified. This runs a multi-step workflow:
   - Classifies the image using Amazon Rekognition (`DetectLabels`)
   - Invokes a Bedrock Agent (Claude 3.5 Haiku) to visually verify the hazard and assess severity
   - Writes an alert record (`PK=ALERT`) to DynamoDB
4. **API layer** — API Gateway exposes `GET /cameras/latest` (presigned S3 URLs) and `GET /cameras/alerts` (alert records).
5. **Frontend** — React SPA polls the API for live camera feeds (30s) and alerts (15s), rendering an interactive airport map with camera markers and status indicators.

## Project Structure

```
runway-watcher/
├── frontend/                  # React SPA (Vite + Tailwind + TypeScript)
│   ├── public/config.js       # Runtime config (replaced at deploy time)
│   ├── src/App.tsx             # Main application (all views, hooks, map)
│   └── src/config.ts           # Runtime config loader
│
├── backend/                   # Lambda handlers (TypeScript)
│   ├── upload-images.ts       # Scheduled: uploads camera images to S3
│   ├── process-image.ts       # EventBridge: writes image metadata to DynamoDB
│   ├── get-latest-images.ts   # API: returns camera feeds with presigned URLs
│   ├── get-alerts.ts          # API: queries DynamoDB for alerts
│   └── analyse-hazard.ts      # DynamoDB Streams: durable hazard analysis workflow
│
├── infrastructure/            # AWS CDK stacks
│   ├── lib/
│   │   ├── stateful-stack.ts  # DynamoDB + S3 camera images bucket
│   │   ├── stateless-stack.ts # API Gateway + Lambdas + Bedrock Agent + events
│   │   └── frontend-stack.ts  # S3 + CloudFront + runtime config injection
│   ├── constructs/            # Reusable CDK constructs (CustomLambda, CustomTable)
│   └── config/                # Stage-based environment config (dev/prod)
│
└── resources/
    └── camera-images/         # Sample images bundled with upload-images Lambda
```

## Prerequisites

- Node.js 22+
- npm 10+
- AWS CLI configured with appropriate credentials
- AWS CDK CLI (`npm install -g aws-cdk`)

## Getting Started

```bash
# Install all workspace dependencies
npm install

# Start the frontend dev server
npm run frontend
```

### Local Development

Copy the example env files and configure them:

```bash
# Frontend — set your API URL
cp frontend/.env.local.example frontend/.env.local

# Backend — for local testing with SAM or similar
cp local.env.json.example local.env.json
```

`frontend/.env.local`:
```
VITE_API_URL=https://your-api-gateway-url.execute-api.eu-west-1.amazonaws.com/prod
```

`local.env.json`:
```json
{
  "POWERTOOLS_LOG_LEVEL": "DEBUG",
  "TABLE_NAME": "RunwayWatcherTable",
  "BUCKET_NAME": "your-camera-images-bucket"
}
```

## Scripts

Run from the repo root:

| Command                  | Description                        |
|--------------------------|------------------------------------|
| `npm run frontend`       | Start frontend dev server (Vite)   |
| `npm run build:frontend` | Build frontend for production      |
| `npm run build:backend`  | Bundle backend Lambda handlers     |
| `npm run build:infra`    | Compile infrastructure TypeScript  |
| `npm run lint`           | Lint frontend (ESLint)             |
| `npm run test:infra`     | Run infrastructure tests (Jest)    |
| `npm run synth`          | CDK synth                          |
| `npm run deploy`         | CDK deploy all stacks              |

Target a specific workspace:

```bash
npm run <script> -w frontend
npm run <script> -w infrastructure
npm run <script> -w backend
```

## Deployment

```bash
# Set the target stage (defaults to dev)
export STAGE=dev

# Synthesize CloudFormation templates
npm run synth

# Deploy all three stacks
npm run deploy
```

This deploys three stacks:

- **RunwayWatcherStatefulStack** — DynamoDB table (single-table, PK/SK, streams enabled) and S3 bucket (1-day lifecycle, EventBridge enabled)
- **RunwayWatcherStatelessStack** — API Gateway, five Lambda functions, Bedrock Agent, SNS topic, SQS queue, EventBridge rules
- **RunwayWatcherFrontendStack** — S3 static hosting, CloudFront distribution, runtime config injection via `AwsCustomResource`

### Runtime Config

The frontend uses a `window.__RUNTIME_CONFIG__` pattern. During deployment, CDK writes a `config.js` file to S3 containing the resolved API Gateway URL. In local dev, `VITE_API_URL` from `.env.local` takes precedence.

## Tech Stack

### Frontend
- React 19, TypeScript 5.9, Vite 7
- Tailwind CSS 4, Framer Motion, Recharts, Lucide React
- ESLint 9 (flat config)

### Backend
- TypeScript 5.9 Lambda handlers (bundled by CDK/esbuild)
- AWS SDK v3 (DynamoDB, S3, Rekognition, Bedrock Agent Runtime)
- AWS Lambda Durable Execution SDK for checkpointed workflows
- AWS Lambda Powertools (logging, tracing, metrics)

### Infrastructure
- AWS CDK v2 with cdk-nag (AwsSolutionsChecks)
- Custom constructs: `CustomLambda` (ARM64, Powertools, esbuild, X-Ray) and `CustomTable` (PAY_PER_REQUEST, PITR)
- TypeScript path aliases: `@config`, `@constructs`, `@utils`

## API Endpoints

| Method | Path                | Description                                    |
|--------|---------------------|------------------------------------------------|
| GET    | `/cameras/latest`   | Returns latest camera images with presigned URLs |
| GET    | `/cameras/alerts`   | Returns alert records from DynamoDB             |
| POST   | `/simulate-hazard`  | Triggers a camera image upload (for testing)    |
| POST   | `/initiate-feeds`   | Initiates camera feed uploads                   |

## License

GNU General Public License v3.0
