package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/distributed-scheduler/job-scheduler/internal/cron"
	"github.com/distributed-scheduler/job-scheduler/internal/domain"
	"github.com/distributed-scheduler/job-scheduler/internal/store"
	"github.com/distributed-scheduler/job-scheduler/internal/telemetry"
)

type Server struct {
	store  store.Store
	router *chi.Mux
}

func NewServer(s store.Store) *Server {
	srv := &Server{
		store:  s,
		router: chi.NewRouter(),
	}
	srv.routes()
	return srv
}

func (s *Server) Router() http.Handler {
	return s.router
}

func (s *Server) routes() {
	s.router.Use(middleware.RequestID)
	s.router.Use(middleware.RealIP)
	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)
	s.router.Use(middleware.Timeout(30 * time.Second))

	s.router.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "time": time.Now().UTC().Format(time.RFC3339)})
	})

	s.router.Handle("/metrics", promhttp.Handler())

	s.router.Route("/api/v1", func(r chi.Router) {
		r.Post("/jobs", s.handleSubmitJob)
		r.Get("/jobs", s.handleListJobs)
		r.Get("/jobs/{id}", s.handleGetJob)
		r.Post("/jobs/{id}/cancel", s.handleCancelJob)
		r.Post("/jobs/{id}/requeue", s.handleRequeueJob)

		r.Post("/crons", s.handleCreateCron)
	})
}

type SubmitJobRequest struct {
	IdempotencyKey *string         `json:"idempotency_key,omitempty"`
	Queue          string          `json:"queue"`
	TenantID       string          `json:"tenant_id"`
	Type           string          `json:"type"`
	Payload        json.RawMessage `json:"payload"`
	Priority       int             `json:"priority"`
	MaxAttempts    int             `json:"max_attempts"`
	DelaySeconds   int             `json:"delay_seconds"`
}

func (s *Server) handleSubmitJob(w http.ResponseWriter, r *http.Request) {
	var req SubmitJobRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Type == "" {
		http.Error(w, "job type is required", http.StatusBadRequest)
		return
	}

	job, err := s.store.SubmitJob(r.Context(), domain.SubmitJobInput{
		IdempotencyKey: req.IdempotencyKey,
		Queue:          req.Queue,
		TenantID:       req.TenantID,
		Type:           req.Type,
		Payload:        req.Payload,
		Priority:       req.Priority,
		MaxAttempts:    req.MaxAttempts,
		Delay:          time.Duration(req.DelaySeconds) * time.Second,
	})

	if err != nil {
		if errors.Is(err, domain.ErrDuplicateIdempotencyKey) {
			http.Error(w, "duplicate idempotency key", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	telemetry.JobsSubmittedTotal.WithLabelValues(job.Queue, job.TenantID, job.Type).Inc()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(job)
}

func (s *Server) handleGetJob(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid job id", http.StatusBadRequest)
		return
	}

	job, err := s.store.GetJob(r.Context(), id)
	if err != nil {
		if errors.Is(err, domain.ErrJobNotFound) {
			http.Error(w, "job not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(job)
}

func (s *Server) handleListJobs(w http.ResponseWriter, r *http.Request) {
	queue := r.URL.Query().Get("queue")
	state := domain.JobState(r.URL.Query().Get("state"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	jobs, err := s.store.ListJobs(r.Context(), queue, state, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"jobs":  jobs,
		"count": len(jobs),
	})
}

func (s *Server) handleCancelJob(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid job id", http.StatusBadRequest)
		return
	}

	job, err := s.store.CancelJob(r.Context(), id)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidStateTransition) {
			http.Error(w, "job cannot be cancelled in its current state", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(job)
}

func (s *Server) handleRequeueJob(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid job id", http.StatusBadRequest)
		return
	}

	job, err := s.store.RequeueDeadLetter(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(job)
}

type CreateCronRequest struct {
	Name        string          `json:"name"`
	Expression  string          `json:"expression"`
	Queue       string          `json:"queue"`
	TenantID    string          `json:"tenant_id"`
	Type        string          `json:"type"`
	Payload     json.RawMessage `json:"payload"`
	Priority    int             `json:"priority"`
	MaxAttempts int             `json:"max_attempts"`
}

func (s *Server) handleCreateCron(w http.ResponseWriter, r *http.Request) {
	var req CreateCronRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	sched, err := cron.Parse(req.Expression)
	if err != nil {
		http.Error(w, "invalid cron expression: "+err.Error(), http.StatusBadRequest)
		return
	}

	firstRun := sched.Next(time.Now())

	cronJob, err := s.store.CreateCronJob(r.Context(), domain.CronJob{
		Name:        req.Name,
		Expression:  req.Expression,
		Queue:       req.Queue,
		TenantID:    req.TenantID,
		Type:        req.Type,
		Payload:     req.Payload,
		Priority:    req.Priority,
		MaxAttempts: req.MaxAttempts,
		IsActive:    true,
		NextRunAt:   firstRun,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(cronJob)
}
