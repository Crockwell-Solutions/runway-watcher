# Runway Watcher — Tech Stack & Build

## Monorepo
- npm workspaces with three packages: `frontend`, `backend`, `infrastructure`
- Root `package.json` delegates scripts to workspaces

## Frontend (`frontend/`)
- React 19 with TypeScript (~5.9)
- Vite 7 (dev server and bundler), ESM modules
- framer-motion for animations
- recharts for data visualization
- lucide-react for icons
- ESLint 9 with flat config (typescript-eslint, react-hooks, react-refresh)
- Runtime config pattern: `window.__RUNTIME_CONFIG__` injected via `public/config.js` (replaced at deploy time); `VITE_API_URL` env var takes precedence in dev

## Backend (`backend/`)
- TypeScript, placeholder only — no dependencies or handlers yet

## Infrastructure (`infrastructure/`)
- AWS CDK v2 (TypeScript)
- Two stacks:
  - `RunwayWatcherStatelessStack` — API Gateway (REST, mock integration), SNS topic, SQS queue
  - `FrontendStack` — S3 bucket, CloudFront distribution, BucketDeployment with local bundling, AwsCustomResource for runtime config injection
- CDK app entry point: `bin/runway-watcher.ts` (run via `npx tsx`)
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
