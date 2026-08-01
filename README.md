# BotCortex — Web

The web face of [BotCortex](https://openhorizon.so): teach your robot new tasks by
typing. This repo holds the chat web app (and, later, the marketing site). The Python
runtime lives in
[`botcortex-runtime`](https://github.com/openhorizon-labs/botcortex-runtime);
cloud services will live in `botcortex-api` (later).

| Path | What it is |
|---|---|
| `app/` | The chat web app — Next.js + Bun + Tailwind, static export. Served by the robot on the local network, and hosted on Vercel |
| `site/` | Marketing site (coming) |

## Development

```bash
cd app
bun install
bun run dev     # hot reload at localhost:3000
bun run build   # static export → app/out/
```

## Deployment

**Vercel**: import this repo, set **Root Directory to `app/`** — Next.js is
auto-detected and every push to main deploys. The build is a static export
(`output: "export"`), so the identical artifact is served by the robot locally
(via the runtime's FastAPI server) and by Vercel in the cloud.

## License

Apache-2.0
