# Release Setup Guide

## Current Status

✅ **Binary build pipeline** - Complete and pushed to main
✅ **GitHub Actions workflow** - Complete and pushed to main

## What Happens Now

When you push a tag like `v0.2.0`:
1. GitHub Actions will build binaries for all platforms (macOS, Linux, Windows)
2. GitHub Actions will create a GitHub Release with all binary assets
3. GitHub Actions will publish the package to NPM

## Setup Required

### 1. NPM Authentication (Required)

You have **two options**:

#### Option A: NPM Token (Works Today) ⭐ Recommended for now

1. Go to https://www.npmjs.com/settings/[username]/tokens
2. Create a new "Automation" token
3. Go to your GitHub repo → Settings → Secrets → Actions
4. Add a new secret:
   - Name: `NPM_TOKEN`
   - Value: Your npm automation token

#### Option B: NPM Trusted Publishers (OIDC) - The Future ⭐⭐⭐

This is the modern, secure approach (no long-lived tokens). When Bun fully supports OIDC:

1. Go to https://www.npmjs.com/package/@kitlangton/tailcode
2. Settings → "Trusted Publishers"
3. Add GitHub repository:
   - Owner: `kitlangton`
   - Repo: `tailcode`
   - Workflow: `.github/workflows/release-binaries.yml`
4. Then uncomment the "Option A" section in the workflow and remove "Option B"

### 2. Test the Workflow (Optional but Recommended)

You can test the workflow without creating a real release:

```bash
# 1. Build locally to verify everything works
bun run build:bundle
bun run build:compile
./dist/releases/tailcode-darwin-arm64 --help

# 2. Create a test tag and push to trigger GitHub Actions
git tag v0.1.2-test
git push origin v0.1.2-test

# 3. Watch the Actions run at:
# https://github.com/kitlangton/tailcode/actions

# 4. After testing, delete the test tag
git tag -d v0.1.2-test
git push origin --delete v0.1.2-test
```

### 3. Create a Real Release

```bash
# 1. Update version in package.json
# 2. Commit the version bump
git add package.json
git commit -m "chore: bump version to 0.2.0"

# 3. Create and push tag
git tag v0.2.0
git push origin v0.2.0

# 4. GitHub Actions will automatically:
#    - Build all binaries
#    - Create GitHub Release
#    - Publish to NPM
```

## What Gets Published

### GitHub Release Assets:
- `tailcode-darwin-arm64` (macOS Apple Silicon)
- `tailcode-darwin-x64` (macOS Intel)
- `tailcode-linux-x64` (Linux x64)
- `tailcode-linux-arm64` (Linux ARM)
- `tailcode-windows-x64.exe` (Windows x64)
- `SHA256SUMS` (checksums for verification)

### NPM Package:
The existing bundled JS (`dist/tailcode.js`) is published to NPM as `@kitlangton/tailcode`

## Order of Operations

Based on best practices and the research:

1. **Build** → Happens first (on every tag push)
2. **GitHub Release** → Happens after build succeeds
3. **NPM Publish** → Happens after build succeeds (parallel to GitHub Release)

This order ensures:
- Binaries are available even if NPM publish fails
- NPM package is available for `bunx` users
- Both distribution channels work independently

## Rollback Plan

If something goes wrong:

1. **Delete GitHub Release**: Go to Releases → Delete the broken release
2. **Unpublish NPM** (within 24h): `npm unpublish @kitlangton/tailcode@0.2.0`
3. **Delete tag**: `git push --delete origin v0.2.0 && git tag -d v0.2.0`
4. **Fix issue** and retag

## Monitoring

Watch the releases at:
- GitHub: https://github.com/kitlangton/tailcode/releases
- NPM: https://www.npmjs.com/package/@kitlangton/tailcode
- Actions: https://github.com/kitlangton/tailcode/actions
