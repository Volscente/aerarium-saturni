#!/usr/bin/env just --justfile
# Load from '.env' file

set dotenv-load := true

# Define the root directory based on where this justfile is located

ROOT_DIR := justfile_directory()

# List available commands
help:
    @just --justfile {{ justfile() }} --list --unsorted

# Helper to verify we are in the root before running docker commands
@check_root:
    #!/usr/bin/env bash
    if [ "$PWD" != "{{ ROOT_DIR }}" ]; then \
        echo "Error: Command must be run from the root directory: {{ ROOT_DIR }}"; \
        exit 1; \
    fi

# ---------------- Frontend ----------------

# Full rebuild of the Frontend (clears cache and regenerates search index)
frontend-rebuild: check_root
    #!/usr/bin/env bash
    cd "{{ ROOT_DIR }}/frontend"
    if [ ! -d node_modules ]; then
        npm install
    fi
    rm -rf .next
    npm run build
    npx pagefind --site .next/server/app --output-path public/_pagefind

# Start the Frontend dev server and open it in the browser
frontend-dev: check_root frontend-rebuild
    #!/usr/bin/env bash
    cd "{{ ROOT_DIR }}/frontend"
    open http://localhost:3000 &
    npm run start

# Start the Frontend in dev mode with HMR (no full rebuild — for fast iteration)
frontend-dev-watch: check_root
    #!/usr/bin/env bash
    cd "{{ ROOT_DIR }}/frontend"
    if [ ! -d node_modules ]; then
        npm install
    fi
    open http://localhost:3000 &
    npm run dev

# ----------------------------------------
# ---------------- Backend & Database ----------------

# Start only database + backend (leave port 3000 free for frontend-dev-watch)
run_services: check_root
    docker-compose up --build database backend

# Stop backend docker-compose stack
stop_services: check_root
    docker-compose stop database backend

# Run backend unit tests
backend-test: check_root
    cd "{{ ROOT_DIR }}/backend" && uv run pytest -v

# Run only database
run_database: check_root
    docker-compose up -d database

stop_database: check_root
    docker-compose stop database

# ----------------------------------------
# ---------------- Full Stack ----------------

# Build and start the full stack (database + backend + frontend)
run_stack: check_root
    docker-compose up --build

# Build and start the full stack, force-recreating all containers
run_stack_recreate: check_root
    docker-compose up --build --force-recreate

# Wipe all volumes and rebuild the full stack (use when schema changes require a clean database)
run_stack_fresh: check_root
    docker-compose down -v
    docker-compose up --build

# Stop the full stack
stop_stack: check_root
    docker-compose stop

# ----------------------------------------
