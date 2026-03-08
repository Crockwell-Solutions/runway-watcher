# Runway Watcher — Tech Stack & Build

## Monorepo
- npm workspaces with three packages: `frontend`, `backend`, `infrastructure`
- Root `package.json` delegates scripts to workspaces

## Frontend (`frontend/`)
- React 19 with TypeScript (~5.9)
- Vite 7 (dev server and bundler), ESM modules
- Tailwind CSS 4 (via `@tailwindcss/vite` plugin)
- framer-motion for animations
- recharts for data visualization
- lucide-react for icons
- Google Material Symbols (loaded externally) for map marker icons
- ESLint 9 with flat config (typescript-eslint, react-hooks, react-refresh)
- Runtime config pattern: `window.__RUNTIME_CONFIG__` injected via `public/config.js` (replaced at deploy time); `VITE_API_URL` env var takes precedence in dev

## Backend (`backend/`)
- TypeScript (~5.9), compiled to CommonJS (ES2022 target)
- Four Lambda handlers implemented:
  - `upload-images.ts` — scheduled (EventBridge, every 1 min), uploads sample camera images to S3 with configurable per-camera probability
  - `process-image.ts` — triggered by S3 Object Created events via EventBridge, writes latest-image metadata to DynamoDB
  - `get-latest-images.ts` — API Gateway handler, queries DynamoDB for latest camera records and returns presigned S3 URLs
  - `get-alerts.ts` — API Gateway handler, queries DynamoDB for alert records
- Dependencies: `@aws-sdk/client-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`
- Dev dependencies: `@types/aws-lambda`, `@types/node`

## Infrastructure (`infrastructure/`)
- AWS CDK v2 (TypeScript), with `cdk-nag` (AwsSolutionsChecks) for compliance
- Three stacks:
  - `RunwayWatcherStatefulStack` — DynamoDB table (single-table design, PK/SK), S3 bucket for camera images (1-day lifecycle, EventBridge enabled)
  - `RunwayWatcherStatelessStack` — API Gateway (REST, CORS enabled), four Lambda functions (upload-images, process-image, get-latest-images, get-alerts), SNS topic, SQS queue, EventBridge rules for scheduling and S3 event processing
  - `FrontendStack` — S3 bucket, CloudFront distribution, BucketDeployment with local bundling, AwsCustomResource for runtime config injection
- Custom constructs:
  - `CustomLambda` — wraps NodejsFunction with ARM64, PowerTools env vars, JSON logging, X-Ray tracing, esbuild bundling, optional `copyDirectory` for bundling static files
  - `CustomTable` — wraps DynamoDB Table with PAY_PER_REQUEST billing, PITR, optional seed data import from S3
- CDK app entry point: `bin/runway-watcher.ts` (run via `npx tsx`)
- TypeScript path aliases: `@config`, `@constructs`, `@utils`
- Stage-based config (dev/prod) in `config/environment-config.ts`
- Jest for infrastructure tests

## Common Commands (run from repo root)
```bash
npm install                  # install all workspace deps
npm run frontend             # start frontend dev server (Vite)
npm run build:frontend       # build frontend for production
npm run lint                 # lint frontend (ESLint)
npm run build:infra          # compile infrastructure TypeScript
npm run test:infra           # run infrastructure tests (Jest)
npm run synth                # CDK synth
npm run deploy               # CDK deploy all stacks
```

Target a specific workspace:
```bash
npm run <script> -w frontend
npm run <script> -w infrastructure
npm run <script> -w backend
```
