#!/bin/bash

# Auto-restart script for TournHub development server
# This script monitors the server process and restarts it automatically

LOG_FILE="server.log"
RESTART_COUNT=0
MAX_RESTARTS=50

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

cleanup() {
    log "Cleaning up processes..."
    pkill -f "tsx.*server" 2>/dev/null || true
    pkill -f "node.*dev" 2>/dev/null || true
    exit 0
}

start_server() {
    log "Starting server (attempt $((RESTART_COUNT + 1)))"
    
    # Kill any existing server processes
    pkill -f "tsx.*server" 2>/dev/null || true
    sleep 1
    
    # Start the server
    NODE_ENV=development npx tsx server/index.ts &
    SERVER_PID=$!
    
    # Monitor the server process
    while kill -0 $SERVER_PID 2>/dev/null; do
        sleep 5
    done
    
    log "Server process $SERVER_PID has stopped"
    
    # Check if we should restart
    if [ $RESTART_COUNT -lt $MAX_RESTARTS ]; then
        RESTART_COUNT=$((RESTART_COUNT + 1))
        log "Restarting in 3 seconds..."
        sleep 3
        start_server
    else
        log "Max restarts ($MAX_RESTARTS) reached. Stopping."
    fi
}

# Handle signals
trap cleanup SIGINT SIGTERM

# Start the server
log "Starting TournHub auto-restart supervisor..."
start_server