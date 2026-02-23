# tailcode

Small OpenTUI wizard that helps you:

- connect/login to Tailscale
- start an OpenCode server bound to localhost
- publish it to your tailnet via `tailscale serve`
- show a scannable QR + URL

## Run

```bash
bun install
bun run dev
```

## Screenbook (all wizard screens)

Render the real app UI and jump between screens without running the real network flow:

```bash
bun run showcase
```

Optional start screen:

```bash
bun run showcase welcome
bun run showcase tailscale
bun run showcase opencode
bun run showcase publish
bun run showcase install
bun run showcase install-opencode
bun run showcase error
bun run showcase done
```

Screenbook keys:

- `left`/`right` cycle screens
- `q` quit

Notes:

- This project uses `@effect/atom-solid` from npm.
