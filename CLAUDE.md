# TailCode (Tailscale + OpenCode Wizard)

## Objective

A small, standalone TUI wizard that helps a user:
- Connect to Tailscale (auto-login with QR if needed)
- Launch an OpenCode server bound to localhost
- Publish it to the tailnet via `tailscale serve`
- Show a compact URL + QR for phone access

## Tech

- Runtime: Bun
- Effects: Effect (4.0.0-beta.11)
- UI: @opentui/core + @opentui/solid
- State: @effect/atom-solid (Solid integration, from npm — not a local vendor)

## File Structure

```
src/
  main.tsx           # Entry point — renders App, defines atoms (phase, step, log, url, error)
  app.tsx            # Root UI component — all screens, keyboard handling
  flow.ts            # Effect flow: tailscale → opencode → publish; signalExit()
  runtime.ts         # appRuntime (Effect runtime with service layers)
  qr.ts              # renderQR, copyToClipboard, openInBrowser, trim
  services/
    tailscale.ts     # Tailscale service: ensure(), publish()
    opencode.ts      # OpenCode service: start()
    config.ts        # AppConfig (port, password)
    errors.ts        # Tagged error types
```

## Wizard Phases (UX)

The app uses a `phase` atom: `"welcome" | "running" | "error" | "done"`
And a `step` atom: `"tailscale" | "opencode" | "publish"`

### Welcome screen
- Pixel wordmark logo (TAIL / CODE)
- Bullet list of what will happen
- `enter` to start, `q` to quit

### Running screen
- Step list with ▸ active / ✓ done / · pending indicators
- Scrolling log panel (last 6 lines)

### Error screen
- Same step list (✕ on failed step)
- Error message
- `enter` to retry, `q` to quit

### Done screen
- Remote URL + QR code
- Local attach command: `opencode attach http://127.0.0.1:4096`
- Keys: `1` copy URL, `2` open in browser, `3` copy attach command

## Flow (src/flow.ts)

1. `tailscale.ensure(append)` — verifies/connects tailscale, returns binary path
2. `opencode.start(port, password, append)` — starts OpenCode server in scope
3. `tailscale.publish(bin, port, append)` — runs `tailscale serve --bg --yes`, returns remote URL
4. Sets `phase = "done"`, then awaits `exitSignal` to keep scope alive (finalizers run on exit)

## Key Notes

- `flowFn` is an `appRuntime.fn` atom — re-triggering it interrupts any prior run
- QR rendered as Unicode blocks (no ANSI escapes) to avoid OpenTUI corruption
- OpenCode server always bound to `127.0.0.1` to avoid LAN exposure
- Tailscale serve reset before re-publishing to avoid "listener already exists" errors
- `signalExit()` resolves the exit Deferred, which unblocks the flow and lets scope finalize

## Running

```bash
bun run dev        # with HMR
bun run start      # production
bun run showcase   # component showcase
```

## Release Process

Releases are fully automated via `.github/workflows/release-binaries.yml`. **Never manually upload binaries or publish to npm.**

### To cut a release

1. Update `"version"` in `package.json`
2. Commit: `git commit -m "chore: bump version to X.Y.Z"`
3. Push to main: `git push origin main`
4. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`

The tag push triggers the workflow. That's it.

### What the workflow does

| Job | Runner | Output |
|-----|--------|--------|
| `build-macos` | `macos-latest` (arm64) | `tailcode-darwin-arm64` + `tailcode-darwin-x64` (cross-compiled) |
| `build-linux` | `ubuntu-latest` | `tailcode-linux-x64` |
| `github-release` | ubuntu | GitHub Release with all binaries + `SHA256SUMS` |
| `publish-npm` | ubuntu | `@kitlangton/tailcode` on npm |
| `update-homebrew` | ubuntu | Updates `kitlangton/homebrew-tap` formula |

### npm package note

The npm package ships `dist/tailcode.js` (pre-bundled with the Solid JSX plugin) rather than raw
`.tsx` source. `bunfig.toml`'s `preload` only applies in the local project directory — globally
installed packages don't inherit it — so shipping pre-built JS is required for correct JSX rendering.
