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

	// ── WebSocket Endpoint ────────────────────────────────────────────────────

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
