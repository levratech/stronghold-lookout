//go:build tools

// Package lookout declares the core runtime dependencies so that
// go mod tidy does not prune them before they are put to use.
// This pattern is the accepted Go convention for "we shall need these,
// and we shall need them soon."
package lookout

import (
	_ "github.com/google/uuid"
	_ "github.com/nats-io/nats.go"
	_ "github.com/spf13/cobra"
)
