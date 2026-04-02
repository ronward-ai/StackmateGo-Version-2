const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let serverProcess = null;
let restartCount = 0;
const MAX_CONSECUTIVE_RESTARTS = 5;
const RESTART_DELAY = 2000;

console.log('🚀 Starting TournHub development server with supervisor...');

function startServer() {
  // Kill existing process if it exists
  if (serverProcess) {
    try {
      serverProcess.kill('SIGKILL');
    } catch (e) {
      // Ignore error
    }
  }

  console.log(`⚡ Starting server (restart #${restartCount})`);
  
  // Spawn new tsx process
  serverProcess = spawn('npx', ['tsx', 'server/index.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { 
      ...process.env, 
      NODE_ENV: 'development',
      FORCE_COLOR: '1'
    },
    cwd: process.cwd(),
    detached: false
  });

  // Forward stdout
  serverProcess.stdout.on('data', (data) => {
    process.stdout.write(data);
  });

  // Forward stderr
  serverProcess.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  // Handle process exit
  serverProcess.on('exit', (code, signal) => {
    console.log(`\n⚠️  Server process exited with code ${code}, signal ${signal}`);
    
    if (code !== 0 && restartCount < MAX_CONSECUTIVE_RESTARTS) {
      restartCount++;
      console.log(`🔄 Restarting in ${RESTART_DELAY}ms...`);
      setTimeout(startServer, RESTART_DELAY);
    } else if (code !== 0) {
      console.log(`❌ Max restarts reached. Server stopped.`);
    } else {
      console.log(`✅ Server shutdown normally`);
    }
  });

  // Handle process error
  serverProcess.on('error', (error) => {
    console.error(`❌ Server process error: ${error.message}`);
    if (restartCount < MAX_CONSECUTIVE_RESTARTS) {
      restartCount++;
      setTimeout(startServer, RESTART_DELAY);
    }
  });

  // Reset restart counter after successful run
  setTimeout(() => {
    if (serverProcess && !serverProcess.killed) {
      restartCount = 0;
    }
  }, 10000); // Reset after 10 seconds of successful running
}

// Handle supervisor shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Supervisor shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Supervisor shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  process.exit(0);
});

// Start the server
startServer();