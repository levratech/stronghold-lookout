// Package version holds the canonical version information for the
// Stronghold Lookout suite. It is the single source of truth — no
// guesswork, no drift, no surprises.
package version

// These values are set at build time via -ldflags. Until they are,
// they default to sensible development-time sentinels.
var (
	// Version is the semantic version of this build (e.g. "0.1.0").
	Version = "dev"

	// Commit is the abbreviated Git commit SHA baked in at link time.
	Commit = "none"

	// Date is the ISO-8601 build timestamp supplied by the build pipeline.
	Date = "unknown"
)
