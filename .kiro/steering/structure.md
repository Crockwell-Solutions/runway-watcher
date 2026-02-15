# Runway Watcher — Project Structure

```
runway-watcher/
├── frontend/                  # React SPA (Vite + TypeScript)
│   ├── public/
│   │   └── config.js          # Runtime config (replaced at deploy)
│   ├── src/
│   │   ├── App.tsx            # Main application component (all views)
│   │   ├── App.css            # Application styles
│   │   ├── config.ts          # Runtime config loader
│   │   ├── main.tsx           # React entry point
│   │   └── index.css          # Global styles
│   ├── vite.config.ts
│   ├── eslint.config.js       # Flat ESLint config
│   └── tsconfig.json          # Project references (app + node)
│
├── backend/                   # Lambda handlers (not yet implemented)
│   └── package.json
│
├── infrastructure/            # AWS CDK stacks
│   ├── bin/
│   │   └── runway-watcher.ts  # CDK app entry point
│   ├── lib/
│   │   ├── frontend-stack.ts  # S3 + CloudFront + deployment
│   │   └── stateless-stack.ts # API Gateway + SNS + SQS
│   ├── test/                  # Jest tests for CDK stacks
│   ├── cdk.json
│   └── tsconfig.json
│
├── .kiro/
│   └── steering/              # AI assistant steering rules
│
└── package.json               # Root workspace config
```

## Conventions
- Each workspace is scoped under `@runway-watcher/` (e.g. `@runway-watcher/frontend`)
- Infrastructure stacks are split by concern: frontend hosting vs. stateless backend resources
- The frontend is a single-page app; all views live in `App.tsx` currently (dashboard, cameras, hazards, history)
- CDK stacks pass outputs between each other via construct props (e.g. `apiUrl` flows from stateless → frontend stack)
