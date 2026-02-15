# Runway Watcher

Monorepo using npm workspaces with three packages:

- `frontend/` — React app (Vite + TypeScript)
- `infrastructure/` — AWS CDK stacks
- `backend/` — Lambda handlers (coming soon)

## Getting Started

```bash
npm install        # installs all workspace dependencies from root
```

## Scripts (run from root)

| Command                | Description                          |
|------------------------|--------------------------------------|
| `npm run dev`          | Start frontend dev server            |
| `npm run build:frontend` | Build frontend for production     |
| `npm run synth`        | CDK synth                            |
| `npm run deploy`       | CDK deploy all stacks                |
| `npm run build:infra`  | Compile infrastructure TypeScript    |
| `npm run test:infra`   | Run infrastructure tests             |
| `npm run lint`         | Lint frontend                        |

You can also target any workspace directly:

```bash
npm run <script> -w frontend
npm run <script> -w infrastructure
npm run <script> -w backend
```
