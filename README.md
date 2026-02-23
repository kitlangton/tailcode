# TailCode

TailCode is a terminal wizard that connects Tailscale + OpenCode and publishes OpenCode to your tailnet with a shareable URL and QR code.

## Quick Install

Prerequisites: `tailscale` and `opencode` installed and available on your PATH.

### Homebrew (recommended)

```bash
brew tap kitlangton/tap
brew install tailcode
tailcode
```

### Bunx (no global install)

```bash
bunx @kitlangton/tailcode
```

### Direct binary

Download the latest binary from [GitHub Releases](https://github.com/kitlangton/tailcode/releases/latest), mark it executable, then run it:

```bash
chmod +x ./tailcode
./tailcode
```

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

### Option 1: Binary Releases (Recommended)

Download pre-built binaries from [GitHub Releases](https://github.com/kitlangton/tailcode/releases):

```bash
# macOS (Apple Silicon)
curl -L -o tailcode https://github.com/kitlangton/tailcode/releases/latest/download/tailcode-darwin-arm64
chmod +x tailcode
./tailcode

# macOS (Intel)
curl -L -o tailcode https://github.com/kitlangton/tailcode/releases/latest/download/tailcode-darwin-x64
chmod +x tailcode
./tailcode

# Linux (x64)
curl -L -o tailcode https://github.com/kitlangton/tailcode/releases/latest/download/tailcode-linux-x64
chmod +x tailcode
./tailcode

# Linux (ARM64)
curl -L -o tailcode https://github.com/kitlangton/tailcode/releases/latest/download/tailcode-linux-arm64
chmod +x tailcode
./tailcode
```

### Option 2: Via Bun (requires Bun runtime)

Requires Bun (the `tailcode` executable is a Bun CLI):

```bash
curl -fsSL https://bun.sh/install | bash
```

Run without installing globally:

```bash
bunx @kitlangton/tailcode
```

Or install globally:

```bash
bun add -g @kitlangton/tailcode
tailcode
```

### Option 3: Run from Source

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
- `tailcode` always opens the setup wizard (use `tailcode --attach` for explicit attach)
- TailCode shows a local attach command after setup: `opencode attach http://127.0.0.1:4096`

## Binary Releases

We provide standalone binaries for:

- **macOS**: `arm64` (Apple Silicon), `x64` (Intel)
- **Linux**: `x64`, `arm64`
- **Windows**: `x64` (coming soon)

Binaries are compiled with Bun and include the Bun runtime. No separate Bun installation needed.

### Verification

All releases include SHA256 checksums in `SHA256SUMS`. Verify after download:

```bash
# macOS/Linux
sha256sum -c SHA256SUMS
```

## Development

### Building Locally

```bash
# Bundle for local testing
bun run build:bundle

# Compile for current platform
bun run build:compile

# Full release build (all platforms + checksums)
bun run build:release
```

### Scripts

- `bun run typecheck` - Type check with TypeScript
- `bun run lint` - Lint with oxlint
- `bun run fmt` - Format with oxfmt
- `bun run check` - Run all checks (typecheck + lint + fmt)

## License

MIT
