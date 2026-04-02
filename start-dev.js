#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

let serverProcess = null;
let restartCount = 0;
const MAX_RESTARTS = 50;

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${timestamp} [dev-wrapper] ${message}`);
}

function startServer() {
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
    } catch (e) {
      // Ignore errors when killing process
    }
  }

  log(`Starting server (attempt ${restartCount + 1})`);
  
  serverProcess = spawn('npx', ['tsx', 'server/index.ts'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development', VITE_ALLOWED_HOSTS: 'all' },
    cwd: process.cwd()
  });

  serverProcess.on('exit', (code, signal) => {
    log(`Server exited with code ${code} and signal ${signal}`);
    
    if (restartCount < MAX_RESTARTS && code !== 0) {
      restartCount++;
      log(`Restarting server in 2 seconds... (${restartCount}/${MAX_RESTARTS})`);
      setTimeout(startServer, 2000);
    } else if (code === 0) {
      log('Server exited normally');
    } else {
      log(`Max restarts reached (${MAX_RESTARTS}). Stopping.`);
    }
  });

  serverProcess.on('error', (error) => {
    log(`Server error: ${error.message}`);
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      setTimeout(startServer, 2000);
    }
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('Received SIGINT, shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  process.exit(0);
});

// Start the server
log('Starting development server with auto-restart...');
startServer();