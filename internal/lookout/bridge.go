// Package lookout is the Primary Interface for Autonomous Agents.
// It provides the core NATS bridge and session management required
// for agents to interact with the Stronghold estate in a persistent
// and reliable manner.
package lookout

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/nats-io/nats.go"
)

// Session represents the active CLI session, maintaining the NATS connection
// and the current user's security context. This is the primary state container
// for autonomous agents operating via the Lookout CLI.
type Session struct {
	nc        *nats.Conn
	mu        sync.Mutex
	BadgeIDs  []string
	JWT       string
	Captured  []string
	maxCapture int
}

// NewSession initializes a global NATS connection using the NATS_URL environment variable.
func NewSession() (*Session, error) {
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = nats.DefaultURL
	}

	nc, err := nats.Connect(natsURL, nats.Name("Stronghold Lookout CLI"))
	if err != nil {
		return nil, fmt.Errorf("NATS connection failed. Do try to keep the server running. (Error: %w)", err)
	}

	s := &Session{
		nc:         nc,
		maxCapture: 50,
	}

	go s.watchBackground()

	return s, nil
}

// Request wraps nc.RequestMsg with a standard 5-second timeout and
// includes the JWT in the Authorization header for authenticated requests.
func (s *Session) Request(subject string, data []byte) (*nats.Msg, error) {
	msg := &nats.Msg{
		Subject: subject,
		Data:    data,
		Header:  make(nats.Header),
	}

	if s.JWT != "" {
		msg.Header.Set("Authorization", "Bearer "+s.JWT)
	}

	res, err := s.nc.RequestMsg(msg, 5*time.Second)
	if err != nil {
		return nil, fmt.Errorf("NATS request failed. One must expect prompt responses in this estate. (Error: %w)", err)
	}
	return res, nil
}

// GetKV retrieves a value from the specified KV bucket.
func (s *Session) GetKV(bucket, key string) ([]byte, error) {
	js, err := s.nc.JetStream()
	if err != nil {
		return nil, fmt.Errorf("JetStream failed. One cannot manage what one cannot reach. (Error: %w)", err)
	}

	kv, err := js.KeyValue(bucket)
	if err != nil {
		return nil, fmt.Errorf("The configuration bucket is empty. One must seed the estate before attempting to prune it. (Error: %w)", err)
	}

	entry, err := kv.Get(key)
	if err != nil {
		return nil, fmt.Errorf("Key not found in the estate's archives. (Error: %w)", err)
	}

	return entry.Value(), nil
}

// PutKV stores a value in the specified KV bucket.
func (s *Session) PutKV(bucket, key string, data []byte) error {
	js, err := s.nc.JetStream()
	if err != nil {
		return fmt.Errorf("JetStream failed. (Error: %w)", err)
	}

	kv, err := js.KeyValue(bucket)
	if err != nil {
		return fmt.Errorf("Configuration bucket missing. (Error: %w)", err)
	}

	_, err = kv.Put(key, data)
	return err
}

// Publish sends a Core NATS message on the supplied subject.
func (s *Session) Publish(subject string, data []byte) error {
	if strings.TrimSpace(subject) == "" {
		return fmt.Errorf("Publish failed. A subject is required.")
	}
	if err := s.nc.Publish(subject, data); err != nil {
		return fmt.Errorf("Publish failed. (Error: %w)", err)
	}
	return nil
}

// Close terminates the NATS connection.
func (s *Session) Close() {
	s.nc.Close()
}

// watchBackground subscribes to stronghold.> and logs events to a local buffer.
func (s *Session) watchBackground() {
	_, err := s.nc.Subscribe("stronghold.>", func(msg *nats.Msg) {
		s.mu.Lock()
		defer s.mu.Unlock()

		event := fmt.Sprintf("[%s] %s: %s", time.Now().Format(time.Kitchen), msg.Subject, string(msg.Data))
		s.Captured = append(s.Captured, event)

		if len(s.Captured) > s.maxCapture {
			s.Captured = s.Captured[1:]
		}
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "Background watcher failed to start. How very inconvenient. (Error: %v)\n", err)
	}
}

// GetCaptured returns the last N captured messages.
func (s *Session) GetCaptured() []string {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Return a copy to avoid race conditions
	captured := make([]string, len(s.Captured))
	copy(captured, s.Captured)
	return captured
}

// PrincipalID returns a placeholder for now, as JWT/Badge logic will be implemented.
func (s *Session) PrincipalID() string {
	if len(s.BadgeIDs) > 0 {
		return s.BadgeIDs[0]
	}
	return "unknown"
}

// ContextID returns the connection ID.
func (s *Session) ContextID() string {
	id, err := s.nc.GetClientID()
	if err != nil {
		return "disconnected"
	}
	return fmt.Sprintf("%d", id)
}
