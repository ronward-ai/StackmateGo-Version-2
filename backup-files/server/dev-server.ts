import { spawn } from 'child_process';
import { log } from './vite.js';

let serverProcess: any = null;
let restartCount = 0;
const MAX_RESTARTS = 100;

function startServer() {
  if (serverProcess) {
    serverProcess.kill();
  }

  log(`Starting server (restart count: ${restartCount})`);
  
  serverProcess = spawn('tsx', ['server/index.ts'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' }
  });

  serverProcess.on('exit', (code: number, signal: string) => {
    log(`Server process exited with code ${code} and signal ${signal}`);
    
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      log(`Restarting server in 1 second...`);
      setTimeout(startServer, 1000);
    } else {
      log(`Max restarts (${MAX_RESTARTS}) reached. Stopping auto-restart.`);
    }
  });

  serverProcess.on('error', (error: Error) => {
    log(`Server process error: ${error.message}`);
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      setTimeout(startServer, 1000);
    }
  });
}

// Handle process termination
process.on('SIGINT', () => {
  log('Received SIGINT, shutting down gracefully...');
  if (serverProcess) {
    serverProcess.kill();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down gracefully...');
  if (serverProcess) {
    serverProcess.kill();
  }
  process.exit(0);
});

// Start the server
startServer();