package cron

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Schedule represents a parsed 5-field cron schedule.
// Fields: minute (0-59), hour (0-23), day of month (1-31), month (1-12), day of week (0-6, Sun=0).
type Schedule struct {
	expr    string
	minutes []bool // 0-59
	hours   []bool // 0-23
	days    []bool // 1-31
	months  []bool // 1-12
	dows    []bool // 0-6 (0 = Sunday)
}

func (s *Schedule) String() string {
	return s.expr
}

// Parse parses a 5-field standard cron expression.
func Parse(expr string) (*Schedule, error) {
	fields := strings.Fields(strings.TrimSpace(expr))
	if len(fields) != 5 {
		return nil, fmt.Errorf("expected 5 cron fields, got %d", len(fields))
	}

	min, err := parseField(fields[0], 0, 59)
	if err != nil {
		return nil, fmt.Errorf("minute field error: %w", err)
	}

	hr, err := parseField(fields[1], 0, 23)
	if err != nil {
		return nil, fmt.Errorf("hour field error: %w", err)
	}

	day, err := parseField(fields[2], 1, 31)
	if err != nil {
		return nil, fmt.Errorf("day field error: %w", err)
	}

	mon, err := parseField(fields[3], 1, 12)
	if err != nil {
		return nil, fmt.Errorf("month field error: %w", err)
	}

	dow, err := parseField(fields[4], 0, 6)
	if err != nil {
		return nil, fmt.Errorf("day of week field error: %w", err)
	}

	return &Schedule{
		expr:    expr,
		minutes: min,
		hours:   hr,
		days:    day,
		months:  mon,
		dows:    dow,
	}, nil
}

func parseField(f string, minVal, maxVal int) ([]bool, error) {
	size := maxVal + 1
	matches := make([]bool, size)

	parts := strings.Split(f, ",")
	for _, part := range parts {
		step := 1
		rangeStr := part
		if strings.Contains(part, "/") {
			sub := strings.Split(part, "/")
			if len(sub) != 2 {
				return nil, fmt.Errorf("invalid step notation %q", part)
			}
			rangeStr = sub[0]
			var err error
			step, err = strconv.Atoi(sub[1])
			if err != nil || step <= 0 {
				return nil, fmt.Errorf("invalid step value %q", sub[1])
			}
		}

		var start, end int
		if rangeStr == "*" {
			start = minVal
			end = maxVal
		} else if strings.Contains(rangeStr, "-") {
			rangeBounds := strings.Split(rangeStr, "-")
			if len(rangeBounds) != 2 {
				return nil, fmt.Errorf("invalid range %q", rangeStr)
			}
			var err error
			start, err = strconv.Atoi(rangeBounds[0])
			if err != nil {
				return nil, fmt.Errorf("invalid range start %q", rangeBounds[0])
			}
			end, err = strconv.Atoi(rangeBounds[1])
			if err != nil {
				return nil, fmt.Errorf("invalid range end %q", rangeBounds[1])
			}
		} else {
			val, err := strconv.Atoi(rangeStr)
			if err != nil {
				return nil, fmt.Errorf("invalid integer %q", rangeStr)
			}
			start = val
			end = val
		}

		if start < minVal || start > maxVal || end < minVal || end > maxVal || start > end {
			return nil, fmt.Errorf("value out of bounds [%d-%d]: %s", minVal, maxVal, rangeStr)
		}

		for i := start; i <= end; i += step {
			matches[i] = true
		}
	}

	return matches, nil
}

// Next calculates the next matching time strictly after the given reference time.
// Truncates to the beginning of the next minute and searches up to 5 years forward.
func (s *Schedule) Next(from time.Time) time.Time {
	t := from.Truncate(time.Minute).Add(time.Minute)
	maxFuture := t.AddDate(5, 0, 0)

	for t.Before(maxFuture) {
		month := int(t.Month())
		if !s.months[month] {
			t = time.Date(t.Year(), t.Month()+1, 1, 0, 0, 0, 0, t.Location())
			continue
		}

		day := t.Day()
		dow := int(t.Weekday())
		if !s.days[day] || !s.dows[dow] {
			t = time.Date(t.Year(), t.Month(), t.Day()+1, 0, 0, 0, 0, t.Location())
			continue
		}

		hour := t.Hour()
		if !s.hours[hour] {
			t = time.Date(t.Year(), t.Month(), t.Day(), t.Hour()+1, 0, 0, 0, t.Location())
			continue
		}

		minute := t.Minute()
		if !s.minutes[minute] {
			t = t.Add(time.Minute)
			continue
		}

		return t
	}

	return time.Time{}
}
