# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## AI Proxy API

A dual OpenAI + Anthropic compatible reverse proxy and portal.

### Artifacts
- `artifacts/api-server` — Express API server with proxy routes at `/v1`
- `artifacts/api-portal` — React frontend portal at `/` (dark theme, inline styles)

### Proxy Endpoints
- `GET /v1/models` — returns 8 models (5 OpenAI, 3 Anthropic), requires Bearer auth
- `POST /v1/chat/completions` — OpenAI-compatible, routes by model prefix
- `POST /v1/messages` — Anthropic native format, routes by model prefix

### Auth
- `PROXY_API_KEY` secret — used as Bearer token for all `/v1` routes
- No key → 401 response

### AI Integrations (Replit-managed, no user API key needed)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` / `AI_INTEGRATIONS_OPENAI_API_KEY`
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` / `AI_INTEGRATIONS_ANTHROPIC_API_KEY`

### Features
- Full tool call support (OpenAI native passthrough, Anthropic ↔ OpenAI format conversion)
- Streaming support with 5s keepalive
- Non-streaming Anthropic always uses internal stream to avoid 10-min timeout
- 50mb body limit
