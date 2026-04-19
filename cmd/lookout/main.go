// Package main is the entry point for the Lookout CLI Runtime.
// This is the Primary Interface for Autonomous Agents, serving as the
// interactive and command-line entry point to the Stronghold estate.
// It uses Cobra for commands and Readline for the interactive REPL.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strings"

	"github.com/chzyer/readline"
	"github.com/levratech/stronghold-lookout/internal/lookout"
	"github.com/spf13/cobra"
)

var session *lookout.Session

func main() {
	var err error
	session, err = lookout.NewSession()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer session.Close()

	rootCmd := &cobra.Command{
		Use:   "lookout",
		Short: "Stronghold Lookout CLI Runtime",
		Long:  "The Primary Interface for Autonomous Agents to manage the Stronghold estate.",
		Run: func(cmd *cobra.Command, args []string) {
			if len(args) == 0 {
				runInteractiveREPL()
			}
		},
	}

	rootCmd.AddCommand(loginCmd())
	rootCmd.AddCommand(whoamiCmd())
	rootCmd.AddCommand(seedCmd())
	rootCmd.AddCommand(capturedCmd())
	rootCmd.AddCommand(configCmd())

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Execution failed. A standard error, really. (Error: %v)\n", err)
		os.Exit(1)
	}
}

func loginCmd() *cobra.Command {
	var email, password, domain string
	cmd := &cobra.Command{
		Use:   "login",
		Short: "Sends a sentry.auth.login request with credentials",
		Run: func(cmd *cobra.Command, args []string) {
			payload := map[string]string{
				"email":     email,
				"password":  password,
				"domain_id": domain,
			}
			data, _ := json.Marshal(payload)

			msg, err := session.Request("sentry.auth.login", data)
			if err != nil {
				fmt.Printf("Login failed. One's credentials must be impeccable. (Error: %v)\n", err)
				return
			}

			var resp struct {
				Token string `json:"token"`
				Error string `json:"error"`
			}
			if err := json.Unmarshal(msg.Data, &resp); err != nil {
				fmt.Printf("Failed to decode response. (Error: %v)\n", err)
				return
			}

			if resp.Error != "" {
				fmt.Printf("Login failed: %s\n", resp.Error)
				return
			}

			if resp.Token == "" {
				fmt.Println("Login failed: No token received in response.")
				return
			}

			var raw map[string]json.RawMessage
			if err := json.Unmarshal(msg.Data, &raw); err == nil {
				if rawErr, ok := raw["error"]; ok {
					var errMsg string
					if err := json.Unmarshal(rawErr, &errMsg); err == nil && errMsg != "" {
						fmt.Printf("Login failed: %s\n", errMsg)
						return
					}
					fmt.Println("Login failed: Received an error response instead of a token.")
					return
				}
			}

			session.AdoptJWT(resp.Token)
			fmt.Printf("JWT: %s\n", session.JWT)
			fmt.Println("Login successful. Welcome back to the estate.")
		},
	}

	cmd.Flags().StringVar(&email, "email", "", "Login email")
	cmd.Flags().StringVar(&password, "password", "", "Login password")
	cmd.Flags().StringVar(&domain, "domain", "", "Login domain")
	return cmd
}

func configCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "Manage Aegis Edge configuration",
	}

	cmd.AddCommand(&cobra.Command{
		Use:   "get",
		Short: "Fetches current edge_routes_v1 JSON",
		Run: func(cmd *cobra.Command, args []string) {
			data, err := session.GetKV("aegis_config", "edge_routes_v1")
			if err != nil {
				fmt.Printf("%v\n", err)
				return
			}
			fmt.Println(string(data))
		},
	})

	cmd.AddCommand(&cobra.Command{
		Use:   "set [key] [value]",
		Short: "Updates specific fields in the edge configuration",
		Args:  cobra.ExactArgs(2),
		Run: func(cmd *cobra.Command, args []string) {
			key := args[0]
			val := args[1]

			data, err := session.GetKV("aegis_config", "edge_routes_v1")
			if err != nil {
				fmt.Printf("%v\n", err)
				return
			}

			var config map[string]interface{}
			if err := json.Unmarshal(data, &config); err != nil {
				fmt.Printf("Failed to decode configuration. It seems someone has been untidy. (Error: %v)\n", err)
				return
			}

			// Simple nested key support (e.g., "routes.0.header_secret") could be added here.
			// For now, we'll support top-level keys or specific known paths.
			config[key] = val

			newData, _ := json.MarshalIndent(config, "", "  ")
			if err := session.PutKV("aegis_config", "edge_routes_v1", newData); err != nil {
				fmt.Printf("Failed to update configuration. (Error: %v)\n", err)
				return
			}
			if err := session.Publish("aegis.config.update", []byte("kv-updated")); err != nil {
				fmt.Printf("Configuration updated in KV, but update notification failed. (Error: %v)\n", err)
				return
			}
			fmt.Println("Configuration updated successfully.")
		},
	})

	cmd.AddCommand(&cobra.Command{
		Use:   "push [file.json]",
		Short: "Overwrites entire edge configuration with a local file",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			data, err := os.ReadFile(args[0])
			if err != nil {
				fmt.Printf("Cannot read the file. One must provide valid documents. (Error: %v)\n", err)
				return
			}

			// Validate JSON before pushing
			var config interface{}
			if err := json.Unmarshal(data, &config); err != nil {
				fmt.Printf("Invalid JSON document. (Error: %v)\n", err)
				return
			}

			if err := session.PutKV("aegis_config", "edge_routes_v1", data); err != nil {
				fmt.Printf("Failed to push configuration. (Error: %v)\n", err)
				return
			}
			if err := session.Publish("aegis.config.update", []byte("kv-pushed")); err != nil {
				fmt.Printf("Configuration stored in KV, but update notification failed. (Error: %v)\n", err)
				return
			}
			fmt.Println("Configuration pushed successfully.")
		},
	})

	return cmd
}

func whoamiCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: "Displays current session information",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("RootPrincipalID:   %s\n", session.RootID())
			fmt.Printf("ActivePrincipalID: %s\n", session.PrincipalID())
			fmt.Printf("PrincipalType:     %s\n", session.PrincipalType)
			fmt.Printf("ContextID:         %s\n", session.ContextID())
		},
	}
}

func seedCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "seed",
		Short: "Triggers the stronghold.db.seed_edge_config subject",
		Run: func(cmd *cobra.Command, args []string) {
			msg, err := session.Request("stronghold.db.seed_edge_config", []byte("{}"))
			if err != nil {
				fmt.Printf("Seed failed. The database remains fallow. (Error: %v)\n", err)
				return
			}
			fmt.Println("Seed configuration pushed to JetStream successfully.")
			fmt.Printf("Response: %s\n", string(msg.Data))
		},
	}
}

func capturedCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "captured",
		Short: "Dumps the last 50 NATS messages to stdout",
		Run: func(cmd *cobra.Command, args []string) {
			messages := session.GetCaptured()
			if len(messages) == 0 {
				fmt.Println("No messages captured. The estate is quiet.")
				return
			}
			for _, msg := range messages {
				fmt.Println(msg)
			}
		},
	}
}

func runInteractiveREPL() {
	rl, err := readline.NewEx(&readline.Config{
		Prompt:          "lookout> ",
		HistoryFile:     "/tmp/lookout.tmp",
		InterruptPrompt: "^C",
		EOFPrompt:       "exit",
	})
	if err != nil {
		log.Fatalf("Readline initialization failed. (Error: %v)", err)
	}
	defer rl.Close()

	fmt.Println("Lookout Interactive REPL. Type 'help' for commands.")

	for {
		line, err := rl.Readline()
		if err == io.EOF {
			break
		}
		if err == readline.ErrInterrupt {
			if len(line) == 0 {
				break
			} else {
				continue
			}
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if line == "exit" || line == "quit" {
			break
		}

		args := strings.Split(line, " ")

		// Use Cobra to execute the command from the REPL line
		root := &cobra.Command{
			Use: "lookout",
		}
		root.AddCommand(loginCmd())
		root.AddCommand(whoamiCmd())
		root.AddCommand(seedCmd())
		root.AddCommand(capturedCmd())
		root.AddCommand(configCmd())

		// Set output to readline
		root.SetOut(rl.Stdout())
		root.SetErr(rl.Stderr())
		root.SetArgs(args)

		if err := root.Execute(); err != nil {
			fmt.Fprintf(rl.Stderr(), "Command failed. (Error: %v)\n", err)
		}
	}
}
