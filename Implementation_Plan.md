Referense Multiverse_PRD.md for any uncertainties or confusion.

The 50-Step Implementation Plan: Multiverse VC
Phase 1: Project Scaffolding & Foundation

Initialize the monorepo root directory multiverse-vc.

Scaffold the Go backend daemon (/daemon) using go mod init.

Scaffold the frontend visualizer (/canvas) using Vite + React + TypeScript.

Scaffold the IDE extension wrapper (/extension) using VS Code extension TypeScript boilerplate.

Install backend dependencies (gin-gonic/gin, gorilla/websocket) in the Go daemon.

Install frontend dependencies (reactflow, tailwindcss, lucide-react) in the canvas.

Install extension dependencies (@types/node, typescript) and configure build scripts.

Phase 2: Go Daemon Engine & Core API
8. Create daemon/main.go and implement a Gin HTTP server listening on localhost:4444.
9. Add a GET /health endpoint to verify daemon status from the extension/canvas.
10. Implement a GET /ws WebSocket endpoint with a continuous heartbeat ping loop.
11. Create an exec.Command Go wrapper utility to run headless Git CLI operations securely.
12. Define Go struct definitions matching the multiverse.json schema (node_id, git_hash, parent_id, intent_prompt, timestamp, worktree_path).
13. Implement repository initialization logic: hidden .multiverse/.git setup and Genesis Node creation.
14. Implement utility functions to read, write, and map the multiverse.json metadata file to the active Git graph.

Phase 3: Web Visualizer - React Flow Canvas
15. Configure tailwind.config.js and inject base styles for a dark-mode, Figma-style interface.
16. Initialize a full-screen <ReactFlow> component in canvas/src/App.tsx.
17. Implement a WebSocket client in React to connect to ws://localhost:4444/ws and listen for state events.
18. Fetch the initial graph state from the daemon (via a new GET /graph endpoint) on mount.
19. Build a custom CommitNode React Flow component to display the intent_prompt, hash, and status.
20. Map the Go daemon's graph payload to React Flow's nodes and edges arrays dynamically.
21. Configure an auto-layout algorithm (e.g., dagre) to position nodes horizontally to prevent overlapping.

Phase 4: IDE Extension Wrapper & Interception
22. Implement activate() to spawn the compiled Go daemon as a child background process.
23. Implement deactivate() to cleanly kill the daemon process and release the port on IDE close.
24. Set up a VS Code Webview panel command to serve the Vite frontend canvas inside the IDE.
25. Hook into the IDE’s AI chat (Pre-Hook) to capture and store the user's intended action string.
26. Hook into the IDE's AI code-application lifecycle (Post-Hook) to detect successful file changes.
27. Expose IDE-specific API hooks for Context Clearing (e.g., cursor.chat.clearHistory()).
28. Expose IDE-specific API hooks for Workspace Re-indexing (e.g., cursor.workspace.reindex()).

Phase 5: The "Vibe Coding" Loop (Prompt-as-Commit)
29. Implement POST /snapshot in the daemon expecting { "prompt": "string" }.
30. In /snapshot, securely execute git add . followed by git commit -m "{prompt}".
31. Wire the Extension's Post-Hook to automatically fire POST /snapshot using the captured intent.
32. Upon successful snapshot, append the new Git hash and metadata to multiverse.json and broadcast a WebSocket update.
33. Implement POST /reset (git reset --hard) to handle uncommitted Agent haling/errors.
34. Build an error toast UI in the Canvas for "Agent Halted", exposing "Fix it" and "Scrap it" (calls /reset) buttons.

Phase 6: Branching (The Multiverse)
35. Canvas UX: Enable React Flow onConnect to trigger when a user drags a node edge to an empty space.
36. Canvas UX: Show an "Intent Modal" on drag-drop, capturing the text for the new branch's prompt.
37. Daemon API: Implement POST /branch receiving the source_hash and new_intent.
38. Daemon Git: Execute git worktree add ../.multiverse/worktrees/{new_uuid} {source_hash} within /branch.
39. Daemon Metadata: Register the new branch state in multiverse.json and broadcast the update.

Phase 7: Context Sandboxing & Time Travel
40. Canvas UX: Implement double-click on existing nodes to trigger Time Travel.
41. Daemon API: Implement POST /switch to handle workspace transitions, accepting a target_hash.
42. Daemon Git: Within /switch, dynamically change the active IDE project OS symlink to the target worktree path.
43. IDE Sync: Ensure the Extension listens for successful /switch events, automatically triggering the Workspace Re-index and Context Flush APIs.

Phase 8: Deterministic Merge Engine (The Crucible)
44. Merge UX: Allow dragging and dropping one node onto another to initiate a "Synthesis" event, rendering a pending loading node.
45. Daemon API: Implement POST /merge receiving the source_hash and target_hash.
46. Ghost Worktree: Spin up an invisible "Crucible" worktree based on Timeline A, and execute git merge <Timeline_B_hash>.
47. Fast-Forward (Success): Handle Git exit code 0 by auto-committing, deleting the Crucible, updating metadata, and painting the Synth Node green.
48. Conflict Halting: Handle exit code >0 by halting, generating .multiverse_merge.md with both intents, leaving conflict markers intact, and painting the Synth Node yellow.
49. The Alley-Oop (Handoff): In the extension, trigger a workspace shift to the Crucible when clicking a yellow node, flushing context so the AI can resolve conflicts based on the .multiverse_merge.md file.
50. Merge Resolution: Implement POST /merge/resolve to check if conflict markers are gone, finalize the commit, and mark the Synth node green.

Agent Action: Phase 1 Workspace Scaffolding & Boilerplate
Instructions for Agent: Execute the following terminal commands to create the workspace footprint, then populate the files with the provided boilerplate to establish the communication bridge.

1. Terminal Initialization Commands (Run at Root)
Bash
# Setup Monorepo Folders
mkdir multiverse-vc && cd multiverse-vc

# 1. Scaffold Go Daemon
mkdir daemon && cd daemon
go mod init multiverse/daemon
go get github.com/gin-gonic/gin
go get github.com/gorilla/websocket
cd ..

# 2. Scaffold Frontend Canvas
npm create vite@latest canvas -- --template react-ts
cd canvas
npm install reactflow tailwindcss lucide-react
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
cd ..

# 3. Scaffold Extension Wrapper
mkdir extension && cd extension
npm init -y
npm install typescript @types/node -D
npx tsc --init
mkdir src
touch src/extension.ts
cd ..
2. Go Daemon Boilerplate (daemon/main.go)
Go
package main

import (
	"log"
	"net/http"
	"os/exec"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// executeGit is the basic wrapper utility for headless Git commands
func executeGit(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func main() {
	r := gin.Default()

	// REST Endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "Multiverse Daemon Active"})
	})

	// WebSocket Endpoint
	r.GET("/ws", func(c *gin.Context) {
		ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Println("WS Upgrade Error:", err)
			return
		}
		defer ws.Close()
		
		// Simple Heartbeat Loop
		for {
			err := ws.WriteJSON(gin.H{"event": "heartbeat", "timestamp": time.Now().Unix()})
			if err != nil {
				log.Println("WS Client Disconnected")
				break
			}
			time.Sleep(5 * time.Second)
		}
	})

	log.Println("Daemon running on localhost:4444")
	if err := r.Run(":4444"); err != nil {
		log.Fatal("Failed to start daemon:", err)
	}
}
3. Frontend Canvas Boilerplate (canvas/src/App.tsx)
TypeScript
import { useEffect, useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

const initialNodes = [
  { id: 'genesis', position: { x: 250, y: 250 }, data: { label: 'Genesis Node (State 0)' } }
];

export default function App() {
  const [status, setStatus] = useState('Connecting...');

  useEffect(() => {
    // Establish WebSocket setup to daemon
    const ws = new WebSocket('ws://localhost:4444/ws');
    
    ws.onopen = () => setStatus('Connected to Multiverse Daemon');
    ws.onmessage = (event) => console.log("WS Message:", JSON.parse(event.data));
    ws.onclose = () => setStatus('Disconnected');

    return () => ws.close();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#1E1E1E' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, color: '#4ade80', fontFamily: 'monospace' }}>
        Status: {status}
      </div>
      <ReactFlow nodes={initialNodes} edges={[]} fitView>
        <Background color="#555" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
4. Extension Wrapper Boilerplate (extension/src/extension.ts)
TypeScript
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

let daemonProcess: ChildProcess | null = null;

export function activate() {
    console.log('Multiverse VC activated. Spawning Daemon...');

    // Path targeting the go daemon directory
    const daemonPath = path.join(__dirname, '..', '..', 'daemon');

    // Spawn the go process (uses `go run` for dev scaffolding)
    daemonProcess = spawn('go', ['run', 'main.go'], { 
        cwd: daemonPath,
        shell: true 
    });

    daemonProcess.stdout?.on('data', (data) => {
        console.log(`[Daemon]: ${data}`);
    });

    daemonProcess.stderr?.on('data', (data) => {
        console.error(`[Daemon Error]: ${data}`);
    });
}

export function deactivate() {
    if (daemonProcess) {
        console.log('Killing Multiverse Daemon...');
        daemonProcess.kill();
        daemonProcess = null;
    }
}