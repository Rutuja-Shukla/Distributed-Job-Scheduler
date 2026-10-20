package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc"

	"github.com/distributed-scheduler/job-scheduler/internal/api"
	grpcService "github.com/distributed-scheduler/job-scheduler/internal/grpc"
	"github.com/distributed-scheduler/job-scheduler/internal/scheduler"
	"github.com/distributed-scheduler/job-scheduler/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/scheduler?sslmode=disable"
	}

	httpPort := os.Getenv("HTTP_PORT")
	if httpPort == "" {
		httpPort = "8080"
	}

	grpcPort := os.Getenv("GRPC_PORT")
	if grpcPort == "" {
		grpcPort = "50051"
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// Connect PostgreSQL pool
	poolConfig, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		logger.Error("unable to parse database url", "error", err)
		os.Exit(1)
	}
	poolConfig.MaxConns = 30
	poolConfig.MinConns = 5
	poolConfig.MaxConnLifetime = 1 * time.Hour
	poolConfig.MaxConnIdleTime = 10 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		logger.Error("failed to connect to postgres pool", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Error("database ping failed", "error", err)
		os.Exit(1)
	}
	logger.Info("connected to postgres", "db", poolConfig.ConnConfig.Database)

	// Initialize store
	pgStore := store.NewPostgresStore(pool)

	// Initialize and start leader-elected scheduler
	sched := scheduler.NewScheduler(pgStore, logger)
	sched.Start(ctx)
	defer sched.Stop()

	// Initialize gRPC Worker Service
	grpcServer := grpc.NewServer()
	workerService := grpcService.NewWorkerServer(pgStore)
	grpcService.RegisterGRPC(grpcServer, workerService)

	grpcListener, err := net.Listen("tcp", ":"+grpcPort)
	if err != nil {
		logger.Error("failed to bind grpc port", "port", grpcPort, "error", err)
		os.Exit(1)
	}

	go func() {
		logger.Info("gRPC worker server listening", "port", grpcPort)
		if err := grpcServer.Serve(grpcListener); err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			logger.Error("grpc server error", "error", err)
		}
	}()

	// Initialize HTTP REST Admin API
	apiServer := api.NewServer(pgStore)
	httpServer := &http.Server{
		Addr:         ":" + httpPort,
		Handler:      apiServer.Router(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("HTTP admin server listening", "port", httpPort)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http server error", "error", err)
		}
	}()

	<-ctx.Done()
	logger.Info("received shutdown signal, draining connections...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	grpcServer.GracefulStop()
	_ = httpServer.Shutdown(shutdownCtx)
	logger.Info("server exited cleanly")
}
