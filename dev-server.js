#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

// Configuration
const SERVER_SCRIPT = 'server/index.ts';
const RESTART_DELAY = 1000; // 1 second
const MAX_RESTARTS = 100;

let serverProcess = null;
let restartCount = 0;
let isShuttingDown = false;

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${timestamp} [dev-server] ${message}`);
}

function startServer() {
  if (isShuttingDown) return;

  log(`Starting server (restart #${restartCount})`);
  
  serverProcess = spawn('npx', ['tsx', SERVER_SCRIPT], {
    stdio: 'inherit',
    env: { 
      ...process.env, 
      NODE_ENV: 'development',
      FORCE_COLOR: '1'
    },
    cwd: process.cwd()
  });

  // Handle server process exit
  serverProcess.on('exit', (code, signal) => {
    if (isShuttingDown) return;
    
    log(`Server process exited with code ${code}, signal ${signal}`);
    
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      log(`Restarting in ${RESTART_DELAY}ms...`);
      setTimeout(startServer, RESTART_DELAY);
    } else {
      log(`Max restarts (${MAX_RESTARTS}) reached. Stopping.`);
    }
  });

  // Handle server process error
  serverProcess.on('error', (error) => {
    if (isShuttingDown) return;
    
    log(`Server process error: ${error.message}`);
    
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      setTimeout(startServer, RESTART_DELAY);
    }
  });

  // Reset restart counter after successful run
  setTimeout(() => {
    if (serverProcess && !serverProcess.killed) {
      restartCount = 0;
    }
  }, 10000);
}

// Handle process shutdown
function shutdown() {
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  log('Shutting down...');
  
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    
    // Force kill after timeout
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }, 5000);
  }
  
  setTimeout(() => {
    process.exit(0);
  }, 6000);
}

// Handle signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the server
log('Starting development server with auto-restart...');
startServer();