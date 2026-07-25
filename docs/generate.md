# Full-stack monorepo scaffold prompt

Create a single Git repository containing a monorepo managed with **npm workspaces** (not Git worktrees). The repository should contain exactly two application workspaces:

- `apps/web` — a React single-page application built with TypeScript
- `apps/api` — a Node backend using NestJS, Express, and TypeORM

Use the latest stable, mutually compatible package versions. Set an appropriate minimum Node.js version in the root `package.json`; the current Vite and TypeORM releases require a modern Node.js release. Use the same compatible Node major version in Docker. Create a root `.nvmrc` containing a specific compatible Node.js version so local installs and builds use the intended runtime.

## Frontend

- React with TypeScript
- Vite as the build tool
- Tailwind CSS v4 using the official Vite plugin
- shadcn initialized through its official CLI
- Keep the shadcn setup minimal:
  - install only the component used by the initial page
  - remove unused components and dependencies created by initialization
- Minimal initial UI: one page containing a small shadcn Card that displays the result of a request to `GET /api/hello`
- Show a compact loading state and a compact failure message
- Configure the Vite development server to proxy `/api` to the backend
- Configure the `@/*` import alias for `src/*`
- When using TypeScript 7 or newer, configure `paths` without the removed `baseUrl` option

## Backend

- NestJS application configured to use the Express platform
- TypeORM connected to PostgreSQL
- Load configuration and secrets from environment variables
- For backend development, use `nodemon` configured to watch only `apps/api/src/**/*` with the `ts` extension; on a source change, run the normal TypeScript build and start `node dist/main.js` only when compilation succeeds
- Do not watch `dist` or use TypeScript's `--watch` mode for process restarts; platform file-watcher failures can emit phantom changes and repeatedly restart the API even when source files are unchanged
- Do not use `tsx` for the backend watcher in this scaffold; it introduces an esbuild native-binary dependency that npm can omit from `package-lock.json` or remove during later installs on platform-specific environments
- Provide `GET /api/hello` with:
  - status `200`
  - `Content-Type: application/json`
  - body `{ "message": "Hello!" }`
- Use a global `/api` prefix for API routes
- Serve the compiled React assets with `express.static`
- Add an SPA fallback that returns `index.html` for non-API `GET` requests
- Do not send `index.html` for `/api`, `/api/*`, non-GET requests, or missing API routes
- Avoid Express 4 wildcard route syntax that is incompatible with Express 5; use middleware-based fallback handling where appropriate

## PostgreSQL and environment configuration

- Configure TypeORM from `DATABASE_URL`
- Support environment flags for PostgreSQL SSL and schema synchronization
- Default schema synchronization to `false`
- Do not disable TLS certificate verification in production defaults
- Create a root `.env.example` containing documented placeholder values such as:
  - `PORT`
  - `DATABASE_URL`
  - `DB_SSL`
  - `DB_SYNCHRONIZE`
- Ignore `.env` in Git
- Load the root `.env` during local development while also supporting directly injected environment variables in containers

## Repository scripts

Add root scripts for:

- `dev` — run the frontend and backend concurrently
- `build` — build both workspaces
- `start` — start the compiled NestJS server

Keep scripts portable and use npm workspace commands rather than duplicating dependency installations.

The backend workspace should configure nodemon like this:

```json
{
  "scripts": {
    "dev": "nodemon"
  },
  "nodemonConfig": {
    "watch": ["src"],
    "ext": "ts",
    "exec": "npm run build && node dist/main.js"
  }
}
```

This keeps development compilation aligned with the production TypeScript build, prevents generated output from triggering another restart, and avoids relying on esbuild platform binaries.

## Node.js version management

- Add a root `.nvmrc` with a Node.js version that satisfies every workspace dependency
- Keep `.nvmrc`, the root `engines.node` constraint, and the Docker Node major version aligned
- In the README, instruct developers using nvm to run `nvm install` and `nvm use` before `npm install`
- Generate `package-lock.json` from a clean install under the `.nvmrc` version
- Do not generate the lockfile using an older, unsupported Node.js runtime; npm can otherwise omit platform-specific optional packages such as the esbuild or Rolldown native binaries

## Docker

Create a root-level multi-stage `Dockerfile` with explicit stages:

1. A dependency stage that installs the locked npm workspace dependencies with `npm ci`
2. A `frontend` stage that builds `apps/web`
3. A `backend` stage that compiles `apps/api`
4. A production Node stage that:
   - installs production dependencies only
   - copies the compiled backend from the backend stage
   - copies the React build from the frontend stage into the path served by Express
   - sets `NODE_ENV=production`
   - runs as the unprivileged `node` user
   - exposes the application port
   - starts the NestJS server, which serves both `/api/*` and the SPA

Also create a `.dockerignore` that excludes dependency directories, build output, Git metadata, logs, and `.env`.

## Scope and quality

- Keep both implementations intentionally small and focused
- Do not add authentication, example entities, CRUD features, test frameworks, linters, formatters, Docker Compose, or other unrelated boilerplate
- Add a concise README covering prerequisites, nvm setup, local setup, build/start commands, and Docker usage
- Generate and commit a root `package-lock.json`
- Initialize the directory as one Git repository if it is not already a repository
- Verify:
  - dependency installation succeeds
  - both workspaces compile in production mode
  - the backend development watcher compiles and reaches Nest application startup without requiring esbuild
  - the backend remains running when no source files change and restarts exactly once after a change under `apps/api/src`
  - the hello handler returns exactly `{ "message": "Hello!" }`
  - the production dependency audit has no known vulnerabilities
  - the Docker image builds successfully when Docker is available

Use this prompt to generate a lightweight, production-oriented React + NestJS + PostgreSQL monorepo scaffold without extra features or unnecessary boilerplate.
