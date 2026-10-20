package fuzz

import (
	"testing"
	"time"

	"github.com/distributed-scheduler/job-scheduler/internal/cron"
)

// FuzzParseCron performs coverage-guided fuzz testing against the cron parser.
// It verifies that arbitrary input strings will never cause panic or buffer overflows,
// and that valid outputs calculate forward timestamps safely.
func FuzzParseCron(f *testing.F) {
	// Seed corpus with valid expressions
	f.Add("* * * * *")
	f.Add("0 0 * * *")
	f.Add("*/5 * * * *")
	f.Add("0 12 * * 1-5")
	f.Add("30 4 1,15 * 5")
	f.Add("*/15 0-6 * * *")
	f.Add("59 23 31 12 6")

	// Seed corpus with invalid / boundary expressions
	f.Add("")
	f.Add("invalid")
	f.Add("* * * *")
	f.Add("* * * * * *")
	f.Add("60 * * * *")
	f.Add("-1 * * * *")
	f.Add("* 24 * * *")
	f.Add("* * 32 * *")
	f.Add("* * * 13 *")
	f.Add("* * * * 7")
	f.Add("*/0 * * * *")
	f.Add("5-2 * * * *")
	f.Add("a,b,c * * * *")
	f.Add("999999999999999999999 * * * *")

	f.Fuzz(func(t *testing.T, expr string) {
		sched, err := cron.Parse(expr)
		if err != nil {
			// Parsing rejected invalid expression cleanly without panic
			return
		}

		if sched == nil {
			t.Fatalf("expected non-nil schedule when err is nil for expression: %q", expr)
		}

		// If successfully parsed, Next() must not panic or loop infinitely
		refTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		next := sched.Next(refTime)
		if !next.IsZero() && next.Before(refTime) {
			t.Fatalf("next run time %v cannot be before reference time %v", next, refTime)
		}
	})
}
