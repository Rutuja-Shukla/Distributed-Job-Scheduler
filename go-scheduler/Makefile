.PHONY: build test test-race lint docker-up docker-down migrate-up load-test fuzz

build:
	go build -v -o bin/server cmd/server/main.go
	go build -v -o bin/worker cmd/worker/main.go
	go build -v -o bin/loadtest cmd/loadtest/main.go

test:
	go test -v ./...

test-race:
	go test -v -race -timeout 5m ./...

test-chaos:
	go test -v -race -run TestChaos ./tests/integration/...

lint:
	golangci-lint run ./...

fuzz:
	go test -fuzz=FuzzParseCron -fuzztime=30s ./tests/fuzz/...

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down -v

migrate-up:
	docker run --rm -v $(PWD)/migrations:/migrations --network host migrate/migrate:v4.17.0 \
		-path=/migrations -database "postgres://postgres:postgrespassword@localhost:5432/scheduler?sslmode=disable" up

load-test:
	go run cmd/loadtest/main.go -jobs 2000 -workers 16 -queue default
