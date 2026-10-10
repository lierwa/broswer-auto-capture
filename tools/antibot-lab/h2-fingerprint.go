// JSON adapter only. Compile beside unchanged pinned Kitsune h2.go (package renamed).
package main

import (
	"encoding/json"
	"fmt"
	"os"
)

func main() {
	var rows []H2Fingerprint
	decoder := json.NewDecoder(os.Stdin)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&rows); err != nil { panic(err) }
	if len(rows) > 1000 { panic("h2_batch_too_large") }
	results := make([]map[string]string, 0, len(rows))
	for _, row := range rows {
		settings, order := row.SettingsBrowser(), row.Browser()
		status, outcome := "measured", "consistent"
		if settings == "unknown" || order == "unknown" { status, outcome = "unavailable", "unknown"
		} else if settings != order { outcome = "mismatch" }
		results = append(results, map[string]string{"settings": settings, "order": order,
			"status": status, "outcome": outcome, "fingerprint": row.String()})
	}
	if err := json.NewEncoder(os.Stdout).Encode(results); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
}
