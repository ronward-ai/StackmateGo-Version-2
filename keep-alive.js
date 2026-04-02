const { spawn } = require('child_process');

let isRunning = false;
let restartCount = 0;
const MAX_RESTARTS = 1000;

function checkAndRestartWorkflow() {
  if (isRunning) return;
  
  isRunning = true;
  console.log(`[keep-alive] Starting workflow (restart #${restartCount})`);
  
  // Start the npm run dev command
  const child = spawn('npm', ['run', 'dev'], {
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'development' },
    cwd: process.cwd()
  });

  // Forward output
  child.stdout.on('data', (data) => {
    process.stdout.write(data);
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  // Handle process exit
  child.on('exit', (code, signal) => {
    isRunning = false;
    console.log(`[keep-alive] Process exited with code ${code}, signal ${signal}`);
    
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      console.log(`[keep-alive] Restarting in 2 seconds...`);
      setTimeout(checkAndRestartWorkflow, 2000);
    } else {
      console.log(`[keep-alive] Max restarts reached`);
    }
  });

  // Handle process error
  child.on('error', (error) => {
    isRunning = false;
    console.error(`[keep-alive] Process error: ${error.message}`);
    
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      setTimeout(checkAndRestartWorkflow, 2000);
    }
  });

  // Reset restart counter after successful run
  setTimeout(() => {
    if (isRunning) {
      restartCount = 0;
    }
  }, 30000);
}

// Start monitoring
checkAndRestartWorkflow();

// Handle shutdown
process.on('SIGINT', () => {
  console.log('[keep-alive] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[keep-alive] Shutting down...');
  process.exit(0);
});