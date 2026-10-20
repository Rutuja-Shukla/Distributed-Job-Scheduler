module github.com/distributed-scheduler/job-scheduler

go 1.22

require (
	github.com/go-chi/chi/v5 v5.0.12
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.5.5
	github.com/prometheus/client_golang v1.19.0
	github.com/stretchr/testify v1.9.0
	github.com/testcontainers/testcontainers-go v0.29.1
	github.com/testcontainers/testcontainers-go/modules/postgres v0.29.1
	go.opentelemetry.io/otel v1.24.0
	go.opentelemetry.io/otel/trace v1.24.0
	google.golang.org/grpc v1.63.2
	google.golang.org/protobuf v1.33.0
)
