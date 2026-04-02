const { spawn } = require('child_process');

function runServer() {
  const child = spawn('npx', ['tsx', 'server/index.ts'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' }
  });

  child.on('exit', (code) => {
    console.log(`Server exited with code ${code}. Restarting...`);
    setTimeout(runServer, 1000);
  });

  child.on('error', (error) => {
    console.error('Server error:', error);
    setTimeout(runServer, 1000);
  });
}

runServer();