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

# Start The Codex dev server and open it in the browser
codex-dev: check_root
    #!/usr/bin/env bash
    cd "{{ ROOT_DIR }}/the-codex"
    if [ ! -d node_modules ]; then
        npm install
    fi
    open http://localhost:3000 &
    npm run dev
