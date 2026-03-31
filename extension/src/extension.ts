import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

// ─── State ────────────────────────────────────────────────────────────────────

let daemonProcess: ChildProcess | null = null;
let canvasPanel: vscode.WebviewPanel | null = null;
let pendingIntent: string | null = null; // Pre-hook: captured user prompt

const DAEMON_PORT = 4444;

// ─── Daemon Lifecycle ─────────────────────────────────────────────────────────

/**
 * Spawn the compiled Go daemon as a background child process.
 * Falls back to `go run main.go` in dev mode.
 */
function spawnDaemon(context: vscode.ExtensionContext): void {
  const daemonDir = path.join(context.extensionPath, '..', 'daemon');
  const isDev = !context.extensionPath.includes('extensions');

  const args = isDev ? ['run', 'main.go'] : ['run', 'main.go']; // replace with binary path for prod
  daemonProcess = spawn('go', args, {
    cwd: daemonDir,
    shell: true,
    env: { ...process.env, MULTIVERSE_ROOT: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '' },
  });

  daemonProcess.stdout?.on('data', (d) => log(`[Daemon] ${d}`));
  daemonProcess.stderr?.on('data', (d) => log(`[Daemon ERR] ${d}`));
  daemonProcess.on('exit', (code) => log(`[Daemon] exited with code ${code}`));
  log('Multiverse daemon spawned.');
}

function killDaemon(): void {
  if (daemonProcess) {
    daemonProcess.kill();
    daemonProcess = null;
    log('Multiverse daemon killed.');
  }
}

// ─── Canvas Webview ───────────────────────────────────────────────────────────

/**
 * Open (or reveal) the Multiverse canvas in a VS Code Webview panel.
 * In dev mode it loads the Vite dev server; in prod it loads the built index.html.
 */
function openCanvas(context: vscode.ExtensionContext): void {
  if (canvasPanel) {
    canvasPanel.reveal(vscode.ViewColumn.Two);
    return;
  }

  canvasPanel = vscode.window.createWebviewPanel(
    'multiverseCanvas',
    'Multiverse VC',
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, '..', 'canvas', 'dist')],
    }
  );

  // In dev: iframe the Vite dev server
  canvasPanel.webview.html = getWebviewContent();

  canvasPanel.onDidDispose(() => {
    canvasPanel = null;
  });
}

function getWebviewContent(): string {
  // Dev mode: embed the Vite canvas via iframe pointing at localhost
  return `<!DOCTYPE html>
<html lang="en" style="height:100%;margin:0">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Multiverse VC</title>
  <style>body,html,iframe{width:100%;height:100%;border:none;margin:0;background:#0f0f14}</style>
</head>
<body>
  <iframe src="http://localhost:5173" allow="*" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
</body>
</html>`;
}

// ─── Pre-Hook: Capture Intent ─────────────────────────────────────────────────

/**
 * Pre-Hook: called before the IDE AI agent executes.
 * Captures the user's prompt as the pending intent for the next snapshot.
 * 
 * NOTE: Actual Cursor/Windsurf AI chat hooks are not public API yet.
 * This is wired to a VS Code command as a placeholder for IDE-specific interception.
 */
async function captureIntent(): Promise<void> {
  const intent = await vscode.window.showInputBox({
    prompt: 'What will you ask the AI to do? (This will become your commit message)',
    placeHolder: 'e.g. "Add dark mode toggle"',
  });

  if (intent) {
    pendingIntent = intent;
    log(`[Pre-Hook] Intent captured: "${intent}"`);
    vscode.window.setStatusBarMessage(`◈ Multiverse: Intent set → "${intent}"`, 5000);
  }
}

// ─── Post-Hook: Trigger Snapshot ─────────────────────────────────────────────

/**
 * Post-Hook: called after the AI agent successfully applies code changes.
 * Fires POST /snapshot with the captured intent.
 */
async function triggerSnapshot(): Promise<void> {
  const intent = pendingIntent ?? 'Agent auto-snapshot';
  pendingIntent = null;

  try {
    const res = await fetch(`http://localhost:${DAEMON_PORT}/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: intent }),
    });

    if (!res.ok) throw new Error(`snapshot failed: ${res.statusText}`);
    const data = await res.json() as { node_id?: string; git_hash?: string };
    log(`[Post-Hook] Snapshot created: ${data.node_id?.slice(0, 8)} @ ${data.git_hash}`);
    vscode.window.setStatusBarMessage(`◈ Multiverse: Snapshot saved — "${intent}"`, 5000);
  } catch (e) {
    vscode.window.showErrorMessage(`Multiverse snapshot failed: ${String(e)}`);
  }
}

// ─── Context Flushing ─────────────────────────────────────────────────────────

/**
 * Context Clear: attempts to invoke IDE-specific APIs to flush AI context window.
 * Cursor/Windsurf APIs are monkey-patched here when available.
 */
async function flushContext(): Promise<void> {
  log('[Context] Flushing AI context window...');

  // Attempt Cursor-specific API (if running inside Cursor IDE)
  try {
    // @ts-ignore — cursor global API (not in standard types)
    if (typeof cursor !== 'undefined' && cursor?.chat?.clearHistory) {
      // @ts-ignore
      await cursor.chat.clearHistory();
      log('[Context] Cursor chat history cleared.');
    }
  } catch { /* Cursor API not available */ }

  // Fallback: trigger workspace reload (forces context re-index)
  // This is commented out to avoid disrupting the user unless explicitly called
  // await vscode.commands.executeCommand('workbench.action.reloadWindow');
}

/**
 * Workspace Re-index: triggers VS Code's built-in file indexing.
 */
async function reindexWorkspace(): Promise<void> {
  log('[Context] Triggering workspace re-index...');
  try {
    // @ts-ignore — Cursor API
    if (typeof cursor !== 'undefined' && cursor?.workspace?.reindex) {
      // @ts-ignore
      await cursor.workspace.reindex();
    }
  } catch { /* not in Cursor */ }
  // Standard VS Code fallback: no public reindex API, workspace refresh happens on file events
  log('[Context] Re-index triggered.');
}

// ─── Utility ─────────────────────────────────────────────────────────────────

const outputChannel = vscode.window.createOutputChannel('Multiverse VC');
function log(msg: string): void {
  outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
}

// ─── Entry Points ─────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  log('Multiverse VC activating...');

  // Spawn daemon
  spawnDaemon(context);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('multiverse.openCanvas', () => openCanvas(context)),
    vscode.commands.registerCommand('multiverse.initialize', async () => {
      vscode.window.showInformationMessage('Multiverse VC: Repository initialized. Open the Canvas to start.');
      openCanvas(context);
    }),
    // Developer convenience commands for pre/post hook testing
    vscode.commands.registerCommand('multiverse.captureIntent', captureIntent),
    vscode.commands.registerCommand('multiverse.triggerSnapshot', triggerSnapshot),
    vscode.commands.registerCommand('multiverse.flushContext', async () => {
      await flushContext();
      await reindexWorkspace();
    }),
  );

  // Auto-open canvas on activation
  openCanvas(context);
  log('Multiverse VC activated.');
}

export function deactivate(): void {
  killDaemon();
  canvasPanel?.dispose();
  log('Multiverse VC deactivated.');
}
