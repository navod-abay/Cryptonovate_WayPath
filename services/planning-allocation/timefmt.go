package main

import (
	"fmt"
	"strconv"
	"strings"
)

// hhmmToMin parses "HH:MM" (or "HH:MM:SS") into minutes after midnight.
func hhmmToMin(s string) (float64, error) {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) < 2 {
		return 0, fmt.Errorf("time %q is not HH:MM", s)
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		return 0, fmt.Errorf("time %q is not HH:MM", s)
	}
	return float64(h*60 + m), nil
}

// minToHHMM formats minutes after midnight as "HH:MM", truncating like the notebook's min_to_hhmm.
func minToHHMM(x float64) string {
	m := int(x)
	return fmt.Sprintf("%02d:%02d", m/60, m%60)
}
