import type { CliRenderer } from "@opentui/core"

let _renderer: CliRenderer | null = null

/**
 * Called from main.tsx after createCliRenderer() so the reference is
 * available to cleanExit() in flow.ts without a circular dependency.
 */
export function storeRenderer(r: CliRenderer): void {
  _renderer = r
}

/**
 * Synchronously restores terminal state via the native OpenTUI library.
 * renderer.suspend() calls:
 *   - lib.disableMouse(rendererPtr)   → native escape codes to turn off mouse tracking
 *   - lib.suspendRenderer(rendererPtr) → native restoreTerminalModes
 *   - stdin.setRawMode(false)          → restore cooked mode
 *
 * This must be called before every process.exit(0) because process.exit()
 * bypasses the renderer's beforeExit / destroy cleanup path.
 */
export function cleanupRenderer(): void {
  if (_renderer) {
    try {
      _renderer.suspend()
    } catch {
      // If suspend throws for any reason, fall through — we're exiting anyway.
    }
    _renderer = null
  }
}
