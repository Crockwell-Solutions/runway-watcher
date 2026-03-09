# Runway Watcher — Project Structure

```
runway-watcher/
├── frontend/                  # React SPA (Vite + TypeScript)
│   ├── public/
│   │   ├── config.js          # Runtime config (replaced at deploy)
│   │   ├── airport.png        # Map background image
│   │   └── favicon.ico
│   ├── src/
│   │   ├── App.tsx            # Main application component (all views, hooks, map, cameras)
│   │   ├── App.css            # Application styles
│   │   ├── config.ts          # Runtime config loader
│   │   ├── main.tsx           # React entry point
│   │   ├── index.css          # Global styles (Tailwind)
│   │   └── assets/
│   │       └── runway-watcher.svg  # Logo
│   ├── vite.config.ts
│   ├── eslint.config.js       # Flat ESLint config
│   └── tsconfig.json          # Project references (app + node)
│
├── backend/                   # Lambda handlers (TypeScript)
│   ├── upload-images.ts       # Scheduled: uploads camera images to S3
│   ├── process-image.ts       # EventBridge: writes latest-image metadata to DynamoDB
│   ├── get-latest-images.ts   # API: returns camera feeds with presigned S3 URLs
│   ├── get-alerts.ts          # API: queries DynamoDB for camera alerts
│   ├── tsconfig.json
│   └── package.json
│
├── infrastructure/            # AWS CDK stacks
│   ├── bin/
│   │   └── runway-watcher.ts  # CDK app entry point (3 stacks)
│   ├── lib/
│   │   ├── stateful-stack.ts  # DynamoDB table + S3 camera images bucket
│   │   ├── stateless-stack.ts # API Gateway + Lambdas + SNS + SQS + EventBridge rules
│   │   └── frontend-stack.ts  # S3 + CloudFront + BucketDeployment + runtime config
│   ├── constructs/
│   │   ├── custom-lambda.ts   # Reusable Lambda construct (NodejsFunction, PowerTools, bundling)
│   │   ├── custom-table.ts    # Reusable DynamoDB table construct (optional seed data)
│   │   └── index.ts
│   ├── config/
│   │   ├── environment-config.ts  # Per-stage config (dev/prod)
│   │   ├── types.ts               # Stage and Region enums
│   │   └── index.ts
│   ├── utils/
│   │   ├── project-root.ts
│   │   └── index.ts
│   ├── cdk.json
│   └── tsconfig.json          # Path aliases: @config, @constructs, @utils
│
├── resources/
│   └── camera-images/         # Sample camera images bundled with upload-images Lambda
│       ├── camera-1-normal.jpeg
│       ├── camera-2-normal.jpeg
│       └── camera-3-normal.jpeg
│
├── .kiro/
│   └── steering/              # AI assistant steering rules
│
└── package.json               # Root workspace config
```

## Conventions
- Each workspace is scoped under `@runway-watcher/` (e.g. `@runway-watcher/frontend`)
- Infrastructure stacks are split into three: stateful (DynamoDB + S3), stateless (API + Lambdas + events), frontend (hosting + CDN)
- Stateful stack exports are passed to stateless stack via construct props; stateless apiUrl flows to frontend stack
- The frontend is a single-page app; all views, hooks, and components live in `App.tsx`
- Infrastructure uses TypeScript path aliases (`@config`, `@constructs`, `@utils`) configured in tsconfig.json
- Backend Lambda handlers are individual .ts files at the root of `backend/`, bundled by CDK's NodejsFunction (esbuild)
- The `resources/camera-images/` directory is copied into the upload-images Lambda bundle at deploy time via the CustomLambda `copyDirectory` option
