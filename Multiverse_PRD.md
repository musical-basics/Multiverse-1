Multiverse VC: AI-Native Version Control
Version: 1.0.0
Document Type: Product Requirements Document (PRD) & System Architecture

1. Product Requirements Document (PRD)
1.1 Objective
To build an AI-native version control extension/plugin for modern agentic IDEs (Cursor, Windsurf, etc.) and an accompanying Web Visualizer. The system utilizes Git's content-addressable storage engine under the hood but completely replaces the traditional terminal/branching interface with a Figma-style node canvas, prompt-based state tracking, and automatic AI context sandboxing.

1.2 Target Audience
"Vibe coders," solo developers, and teams using autonomous AI coding agents who suffer from context-window bleed and IDE workspace corruption when switching branches.

1.3 Core Features
Prompt-as-Commit (Intent Tracking): Every time an AI agent executes a file-altering prompt, the system automatically takes a Git snapshot. The commit message is strictly the user's prompt.

Auto-Context Sandboxing (The "Hard Stop"): When switching states/nodes, the extension automatically forces the IDE's AI agent to flush its active memory/context window and re-indexes only the files associated with the new state.

Figma-Style Visualizer (The Canvas): A web-based (or IDE webview) interactive canvas where each commit/prompt is a playable node. Users branch by dragging a node into empty space.

Zero-Friction Worktrees: Branching visually creates an isolated physical Git worktree in the background, ensuring the AI never hallucinates ghost files from other branches.

1.4 Architecture Overview
IDE Extension (Cursor/Windsurf API): Listens to prompt execution, triggers background Git commands, and manages the AI's context window.

Local Daemon (The Engine): A lightweight background process (e.g., Rust or Go) that intercepts the extension's commands and translates them into headless Git operations (worktree generation, hashing, diffing).

Web/Canvas UI: A React/Next.js frontend using a node-based library (like React Flow) to visualize the Git tree, utilizing a local WebSocket connection to sync state with the IDE.

2. User Flow
Step 1: Initialization
User installs the Multiverse VC extension in Cursor/Windsurf.

User clicks "Initialize Multiverse" in a new folder.

The local daemon initializes a hidden .git repo and creates the Genesis Node (State 0) on the visual canvas.

Step 2: The "Vibe Coding" Loop
User types a prompt into the IDE's AI chat: "Build a dark mode toggle."

Pre-Hook: The extension intercepts the prompt and signals the daemon.

The AI generates and applies the code.

Post-Hook: Upon successful application, the daemon instantly runs git add . and git commit -m "Build a dark mode toggle".

The Canvas UI updates in real-time, drawing a new node connected to State 0.

Step 3: Branching (The Multiverse)
User looks at the Canvas UI and decides they want to try a different UI framework from State 0.

User clicks and drags a line from State 0 to an empty space on the canvas.

User types the intent: "Refactor to Tailwind."

The Sandbox Trigger: The daemon uses git worktree add to create a physically isolated folder in the background.

The IDE extension forces a workspace reload to the new worktree and triggers a command to flush the AI's context cache.

Step 4: Time Travel & Reverting
User realizes the Tailwind refactor broke the app.

User opens the Canvas UI and double-clicks the previous "Build a dark mode toggle" node.

The daemon instantly switches the active worktree back to that exact commit hash. The IDE AI context is flushed and re-indexed to the safe state.

3. Core Logic & Data Structures (core_logic.md)
3.1 State Mapping (The Node Object)
The Canvas UI does not read raw Git logs. The local daemon maintains a metadata mapping (e.g., multiverse.json) that links Git hashes to AI intents.

JSON
{
  "node_id": "uuid-1234",
  "git_hash": "a1b2c3d4",
  "parent_id": "uuid-0000",
  "intent_prompt": "Build a dark mode toggle",
  "timestamp": "2026-03-31T11:57:43Z",
  "worktree_path": "/local/path/to/worktree-a1b2",
  "thumbnail_url": "/local/path/to/screenshot.png"
}
3.2 Context Flushing Logic (IDE Extension)
To ensure the AI does not hallucinate, the extension must hook into the IDE's lifecycle API.

Action: Switch Node

Execution:

Send pause_agent to IDE API.

Execute git checkout <hash> or point IDE workspace to the specific worktree_path.

Call IDE-specific context clearing (e.g., cursor.chat.clearHistory() or Windsurf's Memory reset).

Call cursor.workspace.reindex().

Send resume_agent to IDE API.

3.3 The Wrapper Logic (Daemon)
The daemon abstracts Git complexity into four core commands exposed via a local REST/WebSocket API for the IDE extension:

POST /snapshot

Payload: { "prompt": "string" }

Git Execution: git add . && git commit -m "{prompt}"

POST /branch

Payload: { "source_hash": "string", "new_intent": "string" }

Git Execution: git worktree add ../.multiverse/worktrees/{new_uuid} {source_hash}

POST /switch

Payload: { "target_hash": "string" }

Git Execution: Changes the active symlink of the main project directory to point to the correct worktree, triggering an IDE file-system refresh.

GET /graph

Response: Returns the full tree of node objects for React Flow to render the canvas.

3.4 Edge Case Handling: Uncommitted Agent Halts
Scenario: The agent writes 50% of the code and errors out, leaving the workspace dirty.

Logic: The POST /snapshot is only triggered on an agent success flag. If the agent errors, the user has two options in the UI:

"Fix it": Sends the error to the agent (no commit made yet).

"Scrap it": Triggers git reset --hard to instantly wipe the dirty state back to the active Node's hash, giving the agent a clean slate to try again.


Multiverse VC: Deterministic Merge Engine (Zero-Compute Core)
A successful Merge Engine is what separates a neat visual toy from a production-grade tool. To keep the pure "vibecoding" illusion intact without burning unnecessary background compute or risking silent LLM hallucinations, the daemon must act strictly as a deterministic stage manager. It prepares the context, but leaves the semantic resolution to the user's active IDE agent.

Here is what a bulletproof, 100% deterministic AI-native merge implementation looks like under the hood.

1. The UX: Drag, Drop, and Synthesize
Visually, this feels like a Figma component swap.

The Action: The user drags the "Timeline A" node (e.g., “Add Supabase auth”) and drops it onto the "Timeline B" node (e.g., “Build dark mode toggle”).

The Synth Node: The Canvas instantly creates a new, pending node called a Synthesis Node with a loading state.

Zero Terminal: The user never sees a terminal or a split-pane diff viewer.

2. The Engine: The "Crucible" Sandbox
When that drop happens, the local daemon executes strict, headless Git commands without touching the user's active worktrees.

The Ghost Worktree: The daemon spins up a temporary, invisible, third worktree (the "Crucible") based on Timeline A's hash.

The Auto-Merge: It executes a standard git merge <Timeline_B_hash>.

The Fast-Forward (Success): If Git auto-merges perfectly (exit code 0), the daemon instantly runs git commit, updates the multiverse.json metadata, deletes the ghost worktree, and the Synthesis Node turns green. Done.

3. The Staging Protocol (When Conflicts Happen)
If Git throws a conflict (exit code > 0), the daemon halts. It does not attempt to resolve the conflict or make any API calls. Instead, it acts as a context translator.

Halt & Hold: The daemon leaves the Crucible worktree in its conflicted state, preserving the raw Git conflict markers in the files.

Context Extraction: The daemon retrieves the specific intent_prompt strings for both nodes from the multiverse.json file.

The Context Injection: The daemon generates a localized markdown file named .multiverse_merge.md in the root of the Crucible worktree. This file acts as the semantic prompt for the IDE agent, formatted as follows:

# Multiverse Merge Conflict Context
You are resolving a Git conflict. Do not remove features from either intent. Synthesize them.
- Target Intent: "Add Supabase auth"
- Source Intent: "Build dark mode toggle"

UI Update: The Synthesis Node on the Canvas is marked as "Conflicted" (Yellow).

4. The Handoff: The "Alley-Oop"
The daemon has deterministically staged the problem. The user now uses their existing tools to solve it.

The Workspace Shift: The user clicks the Yellow Synthesis Node. The IDE extension instantly symlinks the user's active workspace to the Crucible worktree and flushes the AI's context cache.

The Execution: The user gives one high-level prompt to their IDE AI Agent (e.g., Antigravity/Claude): "Resolve the git conflicts in this workspace based on the intents in .multiverse_merge.md."

The Final Polish: The agent semantically resolves the files, removes the conflict markers, and deletes .multiverse_merge.md. The user verifies the code, hits "Accept," and the daemon finalizes the commit, turning the Synthesis Node green.





Instructions for Antigravity / Claude AI Agent
Agent Objective: Initialize the Multiverse VC project architecture using Go for the backend daemon and Vite + React for the frontend visualizer. Do not write the core business logic yet; focus exclusively on scaffolding the foundation and ensuring the communication bridge is open.

Architecture & Implementation Steps:

Scaffold the Go Daemon (/daemon):

Initialize a new Go module.

Set up a basic Gin or Fiber HTTP server running on a local port (e.g., localhost:4444).

Create two placeholder endpoints: GET /health and a WebSocket route /ws that broadcasts a simple heartbeat.

Implement a basic exec.Command wrapper utility for running headless Git commands.

Scaffold the Frontend Canvas (/canvas):

Initialize a new React + TypeScript project using Vite (npm create vite@latest canvas -- --template react-ts).

Install reactflow, tailwindcss, and lucide-react (for icons).

Create a single App.tsx view that mounts a full-screen React Flow canvas and establishes a WebSocket connection to ws://localhost:4444/ws.

Scaffold the Extension Wrapper (/extension):

Set up a minimal TypeScript Node.js project representing the VS Code / Cursor extension footprint.

Provide a basic activate() function that spawns the compiled Go binary as a child process.

Code Requirements: Provide the terminal commands to initialize this workspace structure, and provide only the strictly necessary boilerplate for the Go HTTP/WS server and the React Flow mount component. I will guide you through the Git logic integration in the next step.


