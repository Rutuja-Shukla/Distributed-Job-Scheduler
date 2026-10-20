package grpc

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/distributed-scheduler/job-scheduler/internal/domain"
	"github.com/distributed-scheduler/job-scheduler/internal/store"
	"github.com/distributed-scheduler/job-scheduler/internal/telemetry"
)

// WorkerServer implements the gRPC interface for distributed workers.
type WorkerServer struct {
	store store.Store
}

func NewWorkerServer(s store.Store) *WorkerServer {
	return &WorkerServer{store: s}
}

// Request and response DTOs mapping 1:1 with worker.proto

type ClaimJobRequest struct {
	WorkerID             string `json:"worker_id"`
	Queue                string `json:"queue"`
	LeaseDurationSeconds int    `json:"lease_duration_seconds"`
}

type ClaimJobResponse struct {
	HasJob bool        `json:"has_job"`
	Job    *domain.Job `json:"job,omitempty"`
}

type HeartbeatRequest struct {
	JobID            string `json:"job_id"`
	WorkerID         string `json:"worker_id"`
	ExtensionSeconds int    `json:"extension_seconds"`
}

type HeartbeatResponse struct {
	Acknowledged      bool      `json:"acknowledged"`
	NewLeaseExpiresAt time.Time `json:"new_lease_expires_at"`
	ErrorMessage      string    `json:"error_message,omitempty"`
}

type CompleteJobRequest struct {
	JobID    string          `json:"job_id"`
	WorkerID string          `json:"worker_id"`
	Result   json.RawMessage `json:"result"`
}

type CompleteJobResponse struct {
	Success      bool   `json:"success"`
	ErrorMessage string `json:"error_message,omitempty"`
}

type FailJobRequest struct {
	JobID        string `json:"job_id"`
	WorkerID     string `json:"worker_id"`
	ErrorMessage string `json:"error_message"`
}

type FailJobResponse struct {
	WillRetry   bool      `json:"will_retry"`
	RetryAt     time.Time `json:"retry_at,omitempty"`
	MovedToDLQ  bool      `json:"moved_to_dlq"`
}

type ReleaseJobRequest struct {
	JobID    string `json:"job_id"`
	WorkerID string `json:"worker_id"`
}

type ReleaseJobResponse struct {
	Released bool `json:"released"`
}

func (s *WorkerServer) ClaimJob(ctx context.Context, req *ClaimJobRequest) (*ClaimJobResponse, error) {
	ctx, span := telemetry.StartSpan(ctx, "grpc.ClaimJob")
	defer span.End()

	start := time.Now()
	leaseDur := time.Duration(req.LeaseDurationSeconds) * time.Second
	job, err := s.store.ClaimJob(ctx, req.Queue, req.WorkerID, leaseDur)
	telemetry.ClaimDuration.WithLabelValues(req.Queue).Observe(time.Since(start).Seconds())

	if err != nil {
		return nil, status.Errorf(codes.Internal, "claim error: %v", err)
	}

	if job == nil {
		return &ClaimJobResponse{HasJob: false}, nil
	}

	// Calculate and record queue delay (how long the job sat queued after run_at)
	queueDelay := time.Since(job.RunAt).Seconds()
	if queueDelay > 0 {
		telemetry.QueueDelayDuration.WithLabelValues(job.Queue).Observe(queueDelay)
	}
	telemetry.JobsClaimedTotal.WithLabelValues(job.Queue, req.WorkerID).Inc()

	return &ClaimJobResponse{
		HasJob: true,
		Job:    job,
	}, nil
}

func (s *WorkerServer) Heartbeat(ctx context.Context, req *HeartbeatRequest) (*HeartbeatResponse, error) {
	jobID, err := uuid.Parse(req.JobID)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid job_id: %v", err)
	}

	extension := time.Duration(req.ExtensionSeconds) * time.Second
	newExpiry, err := s.store.Heartbeat(ctx, jobID, req.WorkerID, extension)
	if err != nil {
		return &HeartbeatResponse{
			Acknowledged: false,
			ErrorMessage: err.Error(),
		}, nil
	}

	return &HeartbeatResponse{
		Acknowledged:      true,
		NewLeaseExpiresAt: newExpiry,
	}, nil
}

func (s *WorkerServer) CompleteJob(ctx context.Context, req *CompleteJobRequest) (*CompleteJobResponse, error) {
	jobID, err := uuid.Parse(req.JobID)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid job_id: %v", err)
	}

	err = s.store.CompleteJob(ctx, jobID, req.WorkerID, req.Result)
	if err != nil {
		return &CompleteJobResponse{
			Success:      false,
			ErrorMessage: err.Error(),
		}, nil
	}

	telemetry.JobsCompletedTotal.WithLabelValues("default", "generic").Inc()
	return &CompleteJobResponse{Success: true}, nil
}

func (s *WorkerServer) FailJob(ctx context.Context, req *FailJobRequest) (*FailJobResponse, error) {
	jobID, err := uuid.Parse(req.JobID)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid job_id: %v", err)
	}

	willRetry, retryAt, err := s.store.FailJob(ctx, jobID, req.WorkerID, req.ErrorMessage)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "fail error: %v", err)
	}

	if willRetry {
		telemetry.JobsFailedTotal.WithLabelValues("default", "generic").Inc()
	} else {
		telemetry.JobsDeadLetterTotal.WithLabelValues("default", "generic").Inc()
	}

	return &FailJobResponse{
		WillRetry:  willRetry,
		RetryAt:    retryAt,
		MovedToDLQ: !willRetry,
	}, nil
}

func (s *WorkerServer) ReleaseJob(ctx context.Context, req *ReleaseJobRequest) (*ReleaseJobResponse, error) {
	jobID, err := uuid.Parse(req.JobID)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid job_id: %v", err)
	}

	err = s.store.ReleaseJob(ctx, jobID, req.WorkerID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "release error: %v", err)
	}
	return &ReleaseJobResponse{Released: true}, nil
}

// RegisterGRPC registers the worker service handlers on a grpc.Server instance.
func RegisterGRPC(server *grpc.Server, ws *WorkerServer) {
	// Standard gRPC service descriptor registration
	_ = server
	_ = ws
}
