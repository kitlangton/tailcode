# TailCode

TailCode is a small terminal wizard that sets up remote access to OpenCode over your Tailscale tailnet.

It walks you through:
- connecting/logging into Tailscale
- starting `opencode serve` on `127.0.0.1`
- publishing it with `tailscale serve`
- showing the tailnet URL and a QR code for phone access

## How It Works

- TailCode checks that `tailscale` and `opencode` are installed
- If Tailscale is not connected, it prompts you to sign in (including QR-based flows from Tailscale)
- It starts OpenCode locally only (`127.0.0.1`, default port `4096`)
- It runs `tailscale serve` so the app is reachable from devices on your tailnet
- It keeps the process alive until you quit, then cleans up the local server process

## Install Prerequisites

1. Install Tailscale

- macOS: `brew install --cask tailscale-app`
- Windows: `winget install --id tailscale.tailscale --exact`
- Linux: `curl -fsSL https://tailscale.com/install.sh | sh`

Then sign in and make sure Tailscale is running on this machine.

2. Install OpenCode

- macOS: `brew install anomalyco/tap/opencode`
- Linux: `curl -fsSL https://opencode.ai/install | bash`
- Alternative: `bun install -g opencode-ai`

Verify both commands work:

```bash
tailscale version
opencode --version
```

## Run TailCode

```bash
bun install
bun run start
```

For development (hot reload):

```bash
bun run dev
```

## Optional Configuration

- `TAILCODE_PORT` (default: `4096`)
- `TAILCODE_PASSWORD` (optional; passed to `OPENCODE_SERVER_PASSWORD`)

Example:

```bash
TAILCODE_PORT=4096 TAILCODE_PASSWORD=secret bun run start
```

## Usage Notes

- The published URL is only reachable from devices on your Tailscale tailnet
- OpenCode is bound to localhost to avoid exposing it on your LAN
- TailCode shows a local attach command after setup: `opencode attach http://127.0.0.1:4096`
