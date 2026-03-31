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

// executeGit is the basic wrapper utility for headless Git commands.
func executeGit(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func main() {
	r := gin.Default()

	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "Multiverse Daemon Active"})
	})

	// WebSocket endpoint with heartbeat
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
