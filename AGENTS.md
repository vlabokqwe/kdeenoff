# KDeenOff: agent instructions

The project runs on **NestJS** (backend, `backend/`) and **React + Vite** (frontend, `frontend/`) in an npm-workspaces monorepo. The old stack (Eleventy, Nunjucks, vanilla JS pages, Cloudflare Worker, wrangler, D1) has been removed. Do not reintroduce it.

The rules live in `.cursor/rules/` and apply to every agent. Read them first:

- `tech-stack.mdc`: where code lives, how to add endpoints and pages, and the commands.
- `local-matches-production.mdc`: preview at http://localhost:8080/ with `npm run serve`, and the routing that must keep working.
- `visual-only-plain.mdc`: visual constraints, English UI, and no admin restyle.
- `decide-and-ask.mdc`: decide the obvious, and ask before disputed choices.
- `agent-team.mdc`, `cursor-media-generation.mdc`: the team and media generation.
- `no-cursor-reload.mdc`: never reload or restart Cursor; that stops every open chat.

Specialist agent prompts live in `.cursor/agents/`.

Quick reference:

- `npm run serve`: dev preview on :8080 (Vite rebuild-watch plus `nest start --watch`). This is the acceptance preview.
- `npm run build`, then `npm start`: production build and run.
- `npm run typecheck`: must pass before work is reported done.

