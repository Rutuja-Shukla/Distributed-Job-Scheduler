package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/distributed-scheduler/job-scheduler/internal/cron"
	"github.com/distributed-scheduler/job-scheduler/internal/domain"
	"github.com/distributed-scheduler/job-scheduler/internal/store"
)

const SchedulerAdvisoryLockKey = int64(8899223344)

type Scheduler struct {
	store    store.Store
	logger   *slog.Logger
	stopCh   chan struct{}
	wg       sync.WaitGroup
	isLeader bool
	mu       sync.Mutex
}

func NewScheduler(s store.Store, logger *slog.Logger) *Scheduler {
	return &Scheduler{
		store:  s,
		logger: logger,
		stopCh: make(chan struct{}),
	}
}

func (s *Scheduler) Start(ctx context.Context) {
	s.wg.Add(1)
	go s.leaderLoop(ctx)
}

func (s *Scheduler) Stop() {
	close(s.stopCh)
	s.wg.Wait()
}

func (s *Scheduler) IsLeader() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.isLeader
}

func (s *Scheduler) setLeader(val bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.isLeader = val
}

func (s *Scheduler) leaderLoop(ctx context.Context) {
	defer s.wg.Done()
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.releaseLeadership(context.Background())
			return
		case <-s.stopCh:
			s.releaseLeadership(context.Background())
			return
		case <-ticker.C:
			s.checkLeadershipAndSchedule(ctx)
		}
	}
}

func (s *Scheduler) checkLeadershipAndSchedule(ctx context.Context) {
	acquired, err := s.store.TryAcquireLeaderLock(ctx, SchedulerAdvisoryLockKey)
	if err != nil {
		s.logger.Error("error checking advisory lock for scheduler", "error", err)
		s.setLeader(false)
		return
	}

	if !acquired {
		if s.IsLeader() {
			s.logger.Warn("lost scheduler leadership advisory lock")
			s.setLeader(false)
		}
		return
	}

	if !s.IsLeader() {
		s.logger.Info("acquired scheduler leadership via PostgreSQL advisory lock")
		s.setLeader(true)
	}

	// As leader, process due cron jobs
	s.processDueCrons(ctx)
}

func (s *Scheduler) processDueCrons(ctx context.Context) {
	crons, err := s.store.ListDueCronJobs(ctx)
	if err != nil {
		s.logger.Error("failed to list due cron jobs", "error", err)
		return
	}

	for _, c := range crons {
		sched, err := cron.Parse(c.Expression)
		if err != nil {
			s.logger.Error("invalid cron expression for scheduled job", "id", c.ID, "expr", c.Expression, "error", err)
			continue
		}

		nextTime := sched.Next(c.NextRunAt)
		if nextTime.IsZero() {
			s.logger.Error("could not compute next run time for cron", "id", c.ID)
			continue
		}

		// Idempotency key for cron runs guarantees at-most-once enqueue per scheduled timestamp
		idempotencyKey := fmt.Sprintf("cron:%s:%d", c.ID.String(), c.NextRunAt.Unix())

		_, err = s.store.SubmitJob(ctx, domain.SubmitJobInput{
			IdempotencyKey: &idempotencyKey,
			Queue:          c.Queue,
			TenantID:       c.TenantID,
			Type:           c.Type,
			Payload:        c.Payload,
			Priority:       c.Priority,
			MaxAttempts:    c.MaxAttempts,
			Delay:          0,
		})
		if err != nil && err != domain.ErrDuplicateIdempotencyKey {
			s.logger.Error("failed to enqueue cron job instance", "cron_id", c.ID, "error", err)
			continue
		}

		err = s.store.UpdateCronNextRun(ctx, c.ID, nextTime)
		if err != nil {
			s.logger.Error("failed to advance cron next run time", "cron_id", c.ID, "error", err)
		} else {
			s.logger.Info("enqueued cron job instance", "cron_name", c.Name, "scheduled_for", c.NextRunAt, "next_run", nextTime)
		}
	}
}

func (s *Scheduler) releaseLeadership(ctx context.Context) {
	if s.IsLeader() {
		s.logger.Info("releasing scheduler leadership lock on shutdown")
		_ = s.store.ReleaseLeaderLock(ctx, SchedulerAdvisoryLockKey)
		s.setLeader(false)
	}
}
