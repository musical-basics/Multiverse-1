package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// ─── Data Structures ────────────────────────────────────────────────────────

// MultiverseNode maps to a single node in multiverse.json
type MultiverseNode struct {
	NodeID       string `json:"node_id"`
	GitHash      string `json:"git_hash"`
	ParentID     string `json:"parent_id"`
	IntentPrompt string `json:"intent_prompt"`
	Timestamp    string `json:"timestamp"`
	WorktreePath string `json:"worktree_path"`
	Status       string `json:"status"` // "active" | "inactive" | "conflicted"
}

// MultiverseGraph is the full in-memory state persisted as multiverse.json
type MultiverseGraph struct {
	Nodes []MultiverseNode `json:"nodes"`
}

// ─── Global State ────────────────────────────────────────────────────────────

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	clients   = make(map[*websocket.Conn]bool)
	clientsMu sync.Mutex
	graph     MultiverseGraph
	graphMu   sync.RWMutex
	repoRoot  string // absolute path to the managed project root
)

const multiverseDir = ".multiverse"
const graphFile = ".multiverse/multiverse.json"

// ─── Git Utilities ───────────────────────────────────────────────────────────

// executeGit runs a headless git command and returns combined stdout+stderr.
func executeGit(repoPath string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// currentHash returns the short hash of HEAD.
func currentHash(repoPath string) (string, error) {
	out, err := executeGit(repoPath, "rev-parse", "--short", "HEAD")
	if err != nil {
		return "", err
	}
	return stripNewline(out), nil
}

func stripNewline(s string) string {
	if len(s) > 0 && s[len(s)-1] == '\n' {
		return s[:len(s)-1]
	}
	return s
}

// ─── Graph Persistence ────────────────────────────────────────────────────────

func loadGraph(root string) error {
	data, err := os.ReadFile(filepath.Join(root, graphFile))
	if err != nil {
		if os.IsNotExist(err) {
			graph = MultiverseGraph{}
			return nil
		}
		return err
	}
	return json.Unmarshal(data, &graph)
}

func saveGraph(root string) error {
	graphMu.RLock()
	defer graphMu.RUnlock()
	data, err := json.MarshalIndent(graph, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(root, graphFile), data, 0644)
}

func addNode(root string, node MultiverseNode) error {
	graphMu.Lock()
	graph.Nodes = append(graph.Nodes, node)
	graphMu.Unlock()
	return saveGraph(root)
}

// ─── WebSocket Broadcasting ───────────────────────────────────────────────────

func broadcastGraph() {
	graphMu.RLock()
	payload := gin.H{"event": "graph_update", "graph": graph}
	graphMu.RUnlock()

	clientsMu.Lock()
	defer clientsMu.Unlock()
	for conn := range clients {
		if err := conn.WriteJSON(payload); err != nil {
			conn.Close()
			delete(clients, conn)
		}
	}
}

// ─── Initialization ──────────────────────────────────────────────────────────

func initializeRepo(root string) error {
	multiversePath := filepath.Join(root, multiverseDir)
	if err := os.MkdirAll(multiversePath, 0755); err != nil {
		return fmt.Errorf("failed to create .multiverse dir: %w", err)
	}

	// Initialize git inside the project root if not already done
	if _, err := os.Stat(filepath.Join(root, ".git")); os.IsNotExist(err) {
		if out, err := executeGit(root, "init"); err != nil {
			return fmt.Errorf("git init failed: %s %w", out, err)
		}
		// Initial commit to create HEAD
		if out, err := executeGit(root, "commit", "--allow-empty", "-m", "Genesis: Multiverse initialized"); err != nil {
			return fmt.Errorf("genesis commit failed: %s %w", out, err)
		}
	}

	// Load existing graph or create Genesis Node
	if err := loadGraph(root); err != nil {
		return fmt.Errorf("failed to load graph: %w", err)
	}

	if len(graph.Nodes) == 0 {
		hash, err := currentHash(root)
		if err != nil {
			hash = "genesis"
		}
		genesis := MultiverseNode{
			NodeID:       uuid.NewString(),
			GitHash:      hash,
			ParentID:     "",
			IntentPrompt: "Genesis: Multiverse initialized",
			Timestamp:    time.Now().UTC().Format(time.RFC3339),
			WorktreePath: root,
			Status:       "active",
		}
		if err := addNode(root, genesis); err != nil {
			return fmt.Errorf("failed to save genesis node: %w", err)
		}
		log.Printf("Genesis Node created: %s @ %s", genesis.NodeID[:8], hash)
	}

	return nil
}

// ─── Main ────────────────────────────────────────────────────────────────────

func main() {
	// Default to current working directory as the managed repo root
	cwd, err := os.Getwd()
	if err != nil {
		log.Fatal("Cannot determine working directory:", err)
	}
	repoRoot = cwd

	if err := initializeRepo(repoRoot); err != nil {
		log.Fatal("Initialization failed:", err)
	}

	r := gin.Default()

	// CORS for canvas dev server
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		c.Next()
	})

	// ── REST Endpoints ────────────────────────────────────────────────────────

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "Multiverse Daemon Active", "root": repoRoot})
	})

	r.GET("/graph", func(c *gin.Context) {
		graphMu.RLock()
		defer graphMu.RUnlock()
		c.JSON(http.StatusOK, graph)
	})

	// ── POST /snapshot — git add . && git commit -m "{prompt}" ─────────────────

	r.POST("/snapshot", func(c *gin.Context) {
		var body struct {
			Prompt string `json:"prompt"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Prompt == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "prompt is required"})
			return
		}

		// Stage all changes
		if out, err := executeGit(repoRoot, "add", "."); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "git add failed", "detail": out})
			return
		}

		// Commit with intent prompt as message
		if out, err := executeGit(repoRoot, "commit", "-m", body.Prompt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "git commit failed", "detail": out})
			return
		}

		hash, err := currentHash(repoRoot)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read commit hash"})
			return
		}

		// Find parent node (last active node)
		parentID := ""
		graphMu.RLock()
		for i := len(graph.Nodes) - 1; i >= 0; i-- {
			if graph.Nodes[i].Status == "active" {
				parentID = graph.Nodes[i].NodeID
				break
			}
		}
		graphMu.RUnlock()

		// Create new node
		newNode := MultiverseNode{
			NodeID:       uuid.NewString(),
			GitHash:      hash,
			ParentID:     parentID,
			IntentPrompt: body.Prompt,
			Timestamp:    time.Now().UTC().Format(time.RFC3339),
			WorktreePath: repoRoot,
			Status:       "active",
		}

		if err := addNode(repoRoot, newNode); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save node"})
			return
		}

		// Broadcast updated graph to all canvas clients
		go broadcastGraph()

		c.JSON(http.StatusOK, newNode)
	})

	// ── POST /reset — git reset --hard (scrap dirty state) ───────────────────

	r.POST("/reset", func(c *gin.Context) {
		if out, err := executeGit(repoRoot, "reset", "--hard"); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "git reset failed", "detail": out})
			return
		}
		hash, _ := currentHash(repoRoot)
		c.JSON(http.StatusOK, gin.H{"status": "reset", "head": hash})
	})

	// ── POST /branch — create isolated worktree from a given hash ─────────────

	r.POST("/branch", func(c *gin.Context) {
		var body struct {
			SourceHash string `json:"source_hash"`
			NewIntent  string `json:"new_intent"`
			ParentID   string `json:"parent_id"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.SourceHash == "" || body.NewIntent == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "source_hash and new_intent are required"})
			return
		}

		newID := uuid.NewString()
		worktreesDir := filepath.Join(repoRoot, ".multiverse", "worktrees")
		if err := os.MkdirAll(worktreesDir, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot create worktrees dir"})
			return
		}
		worktreePath := filepath.Join(worktreesDir, newID)

		// Create an isolated worktree at the source hash
		branchName := "mv-" + newID[:8]
		if out, err := executeGit(repoRoot, "worktree", "add", "-b", branchName, worktreePath, body.SourceHash); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "git worktree add failed", "detail": out})
			return
		}

		hash, _ := currentHash(worktreePath)

		newNode := MultiverseNode{
			NodeID:       newID,
			GitHash:      hash,
			ParentID:     body.ParentID,
			IntentPrompt: body.NewIntent,
			Timestamp:    time.Now().UTC().Format(time.RFC3339),
			WorktreePath: worktreePath,
			Status:       "inactive",
		}

		if err := addNode(repoRoot, newNode); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save branch node"})
			return
		}

		go broadcastGraph()
		c.JSON(http.StatusOK, newNode)
	})

	// ── POST /switch — change active workspace to target worktree ─────────────

	r.POST("/switch", func(c *gin.Context) {
		var body struct {
			TargetHash string `json:"target_hash"`
			NodeID     string `json:"node_id"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.NodeID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "node_id is required"})
			return
		}

		// Find the node and its worktree path
		graphMu.RLock()
		var targetNode *MultiverseNode
		for i := range graph.Nodes {
			if graph.Nodes[i].NodeID == body.NodeID {
				n := graph.Nodes[i]
				targetNode = &n
				break
			}
		}
		graphMu.RUnlock()

		if targetNode == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
			return
		}

		// Update status: deactivate all, activate target
		graphMu.Lock()
		for i := range graph.Nodes {
			if graph.Nodes[i].Status == "active" {
				graph.Nodes[i].Status = "inactive"
			}
			if graph.Nodes[i].NodeID == body.NodeID {
				graph.Nodes[i].Status = "active"
			}
		}
		graphMu.Unlock()

		if err := saveGraph(repoRoot); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save graph"})
			return
		}

		go broadcastGraph()

		c.JSON(http.StatusOK, gin.H{
			"status":       "switched",
			"node_id":      targetNode.NodeID,
			"worktree_path": targetNode.WorktreePath,
			"git_hash":     targetNode.GitHash,
		})
	})

	// ── POST /merge — Crucible deterministic merge engine ─────────────────────

	r.POST("/merge", func(c *gin.Context) {
		var body struct {
			SourceHash string `json:"source_hash"` // Timeline A (base)
			TargetHash string `json:"target_hash"` // Timeline B (to merge in)
			SourceID   string `json:"source_id"`
			TargetID   string `json:"target_id"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.SourceHash == "" || body.TargetHash == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "source_hash and target_hash are required"})
			return
		}

		// Create Crucible worktree from Timeline A
		crucibleID := uuid.NewString()
		cruciblesDir := filepath.Join(repoRoot, ".multiverse", "crucibles")
		if err := os.MkdirAll(cruciblesDir, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot create crucibles dir"})
			return
		}
		cruciblePath := filepath.Join(cruciblesDir, crucibleID)
		crucibleBranch := "crucible-" + crucibleID[:8]

		if out, err := executeGit(repoRoot, "worktree", "add", "-b", crucibleBranch, cruciblePath, body.SourceHash); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "crucible worktree creation failed", "detail": out})
			return
		}

		// Attempt the merge
		_, mergeErr := executeGit(cruciblePath, "merge", body.TargetHash, "--no-edit")

		// Find intents for both nodes to build context
		sourceIntent, targetIntent := "Unknown intent", "Unknown intent"
		graphMu.RLock()
		for _, n := range graph.Nodes {
			if n.GitHash == body.SourceHash || n.NodeID == body.SourceID {
				sourceIntent = n.IntentPrompt
			}
			if n.GitHash == body.TargetHash || n.NodeID == body.TargetID {
				targetIntent = n.IntentPrompt
			}
		}
		graphMu.RUnlock()

		// Determine parent node for synthesis node
		parentID := body.SourceID
		if body.SourceID == "" {
			parentID = body.TargetID
		}

		if mergeErr == nil {
			// ✅ Fast-Forward SUCCESS: commit, clean up Crucible, mark node green
			if out, err := executeGit(cruciblePath, "commit", "--allow-empty", "-m",
				fmt.Sprintf("Synthesis: %s ⊕ %s", sourceIntent, targetIntent)); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "merge commit failed", "detail": out})
				return
			}

			hash, _ := currentHash(cruciblePath)

			// Remove crucible worktree
			executeGit(repoRoot, "worktree", "remove", "--force", cruciblePath)

			synthNode := MultiverseNode{
				NodeID:       uuid.NewString(),
				GitHash:      hash,
				ParentID:     parentID,
				IntentPrompt: fmt.Sprintf("⊕ Synthesis: %s + %s", sourceIntent, targetIntent),
				Timestamp:    time.Now().UTC().Format(time.RFC3339),
				WorktreePath: repoRoot,
				Status:       "synth_ok",
			}
			addNode(repoRoot, synthNode)
			go broadcastGraph()

			c.JSON(http.StatusOK, gin.H{
				"result":    "success",
				"node":      synthNode,
				"message":   "Clean merge — Synthesis Node is green!",
			})
			return
		}

		// ⚠️ CONFLICT: leave Crucible dirty, inject context file, mark node yellow
		mergeContextMD := fmt.Sprintf(`# Multiverse Merge Conflict Context

You are resolving a Git conflict. **Do not remove features from either intent. Synthesize them.**

- **Target Intent (Timeline A):** "%s"
- **Source Intent (Timeline B):** "%s"

Resolve all conflict markers in this workspace. When done, delete this file and run git commit.
`, sourceIntent, targetIntent)

		contextFile := filepath.Join(cruciblePath, ".multiverse_merge.md")
		os.WriteFile(contextFile, []byte(mergeContextMD), 0644)

		// Register a pending synth node (yellow)
		synthNodeID := uuid.NewString()
		synthNode := MultiverseNode{
			NodeID:       synthNodeID,
			GitHash:      "pending-" + crucibleID[:8],
			ParentID:     parentID,
			IntentPrompt: fmt.Sprintf("⚠ Conflict: %s ⊕ %s", sourceIntent, targetIntent),
			Timestamp:    time.Now().UTC().Format(time.RFC3339),
			WorktreePath: cruciblePath,
			Status:       "conflicted",
		}
		addNode(repoRoot, synthNode)
		go broadcastGraph()

		c.JSON(http.StatusConflict, gin.H{
			"result":        "conflict",
			"node":          synthNode,
			"crucible_path": cruciblePath,
			"message":       "Conflict detected. Click the yellow node to resolve with your AI agent.",
		})
	})

	// ── POST /merge/resolve — finalize conflict resolution ────────────────────

	r.POST("/merge/resolve", func(c *gin.Context) {
		var body struct {
			NodeID string `json:"node_id"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.NodeID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "node_id is required"})
			return
		}

		// Find the conflicted node
		graphMu.RLock()
		var conflictedNode *MultiverseNode
		for i := range graph.Nodes {
			if graph.Nodes[i].NodeID == body.NodeID {
				n := graph.Nodes[i]
				conflictedNode = &n
				break
			}
		}
		graphMu.RUnlock()

		if conflictedNode == nil || conflictedNode.Status != "conflicted" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "conflicted node not found"})
			return
		}

		cruciblePath := conflictedNode.WorktreePath

		// Check for remaining conflict markers
		grepOut, _ := executeGit(cruciblePath, "diff", "--name-only", "--diff-filter=U")
		if len(grepOut) > 0 {
			c.JSON(http.StatusConflict, gin.H{
				"error":            "conflict markers still present",
				"conflicted_files": grepOut,
			})
			return
		}

		// Stage and finalize commit
		executeGit(cruciblePath, "add", ".")
		if out, err := executeGit(cruciblePath, "commit", "--no-edit", "-m",
			fmt.Sprintf("Resolved: %s", conflictedNode.IntentPrompt)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "commit failed", "detail": out})
			return
		}

		hash, _ := currentHash(cruciblePath)

		// Mark node as resolved
		graphMu.Lock()
		for i := range graph.Nodes {
			if graph.Nodes[i].NodeID == body.NodeID {
				graph.Nodes[i].Status = "synth_ok"
				graph.Nodes[i].GitHash = hash
				graph.Nodes[i].IntentPrompt = "✓ " + graph.Nodes[i].IntentPrompt
			}
		}
		graphMu.Unlock()
		saveGraph(repoRoot)
		go broadcastGraph()

		c.JSON(http.StatusOK, gin.H{
			"result":   "resolved",
			"git_hash": hash,
			"message":  "Synthesis complete — node is now green!",
		})
	})

	// ── GET /ws WebSocket Endpoint ────────────────────────────────────────────


	r.GET("/ws", func(c *gin.Context) {
		ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Println("WS Upgrade Error:", err)
			return
		}

		clientsMu.Lock()
		clients[ws] = true
		clientsMu.Unlock()

		// Send current graph state on connect
		graphMu.RLock()
		ws.WriteJSON(gin.H{"event": "init", "graph": graph})
		graphMu.RUnlock()

		defer func() {
			clientsMu.Lock()
			delete(clients, ws)
			clientsMu.Unlock()
			ws.Close()
		}()

		// Heartbeat loop; also reads to detect client disconnection
		for {
			err := ws.WriteJSON(gin.H{"event": "heartbeat", "timestamp": time.Now().Unix()})
			if err != nil {
				log.Println("WS Client Disconnected")
				break
			}
			time.Sleep(5 * time.Second)
		}
	})

	log.Println("Multiverse Daemon running on localhost:4444")
	if err := r.Run(":4444"); err != nil {
		log.Fatal("Failed to start daemon:", err)
	}
}
