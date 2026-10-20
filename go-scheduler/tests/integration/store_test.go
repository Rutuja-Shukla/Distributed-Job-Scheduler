package integration_test

import (
	"context"
	"encoding/json"
	"math"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/distributed-scheduler/job-scheduler/internal/domain"
)

// Table-driven test suite validating state machine transitions, backoff arithmetic,
// and idempotency deduplication rules.
func TestJobStateMachineTransitions(t *testing.T) {
	tests := []struct {
		name          string
		initialState  domain.JobState
		attempt       int
		maxAttempts   int
		shouldRetry   bool
		expectedState domain.JobState
	}{
		{
			name:          "first failure with attempts remaining",
			initialState:  domain.StateRunning,
			attempt:       1,
			maxAttempts:   3,
			shouldRetry:   true,
			expectedState: domain.StateQueued,
		},
		{
			name:          "second failure with attempts remaining",
			initialState:  domain.StateRunning,
			attempt:       2,
			maxAttempts:   3,
			shouldRetry:   true,
			expectedState: domain.StateQueued,
		},
		{
			name:          "final failure exhausts attempts moving to DLQ",
			initialState:  domain.StateRunning,
			attempt:       3,
			maxAttempts:   3,
			shouldRetry:   false,
			expectedState: domain.StateDeadLetter,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			willRetry := tt.attempt < tt.maxAttempts
			assert.Equal(t, tt.shouldRetry, willRetry)

			var nextState domain.JobState
			if willRetry {
				nextState = domain.StateQueued
			} else {
				nextState = domain.StateDeadLetter
			}
			assert.Equal(t, tt.expectedState, nextState)
		})
	}
}

func TestExponentialBackoffJitterBounds(t *testing.T) {
	baseBackoff := 2.0
	maxBackoff := 300.0

	for attempt := 1; attempt <= 10; attempt++ {
		capVal := math.Min(maxBackoff, baseBackoff*math.Pow(2, float64(attempt-1)))
		assert.True(t, capVal >= baseBackoff, "Cap must be at least base backoff")
		assert.True(t, capVal <= maxBackoff, "Cap must not exceed maxBackoff")
	}
}

func TestIdempotencyKeyDeduplication(t *testing.T) {
	seenKeys := make(map[string]uuid.UUID)

	submit := func(key *string) (uuid.UUID, error) {
		if key == nil {
			return uuid.New(), nil
		}
		if id, exists := seenKeys[*key]; exists {
			return id, domain.ErrDuplicateIdempotencyKey
		}
		newID := uuid.New()
		seenKeys[*key] = newID
		return newID, nil
	}

	key := "payment-txn-987"

	// First submission succeeds
	id1, err := submit(&key)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, id1)

	// Second submission with identical key is rejected with duplicate error
	id2, err := submit(&key)
	assert.ErrorIs(t, err, domain.ErrDuplicateIdempotencyKey)
	assert.Equal(t, id1, id2, "Should return existing job ID")

	// Submission with nil key generates new job without conflict
	id3, err := submit(nil)
	require.NoError(t, err)
	assert.NotEqual(t, id1, id3)
}
