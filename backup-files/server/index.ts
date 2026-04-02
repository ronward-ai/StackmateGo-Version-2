import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Handle signals gracefully
    let shutdownRequested = false;
    
    const gracefulShutdown = () => {
      if (shutdownRequested) return;
      shutdownRequested = true;
      
      log('Graceful shutdown initiated...');
      server.close(() => {
        log('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    const { createServer } = await import("http");
    const server = createServer(app);
    
    // Wrap registerRoutes in try-catch
    let io;
    try {
      io = await registerRoutes(app, server);
    } catch (routeError) {
      console.error('Error registering routes:', routeError);
      // Continue without socket.io if routes fail
    }

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error('Server error:', message);
      
      // Always send response, never throw to prevent crashes
      if (!res.headersSent) {
        res.status(status).json({ message });
      }
    });

    // Setup Vite
    if (app.get("env") === "development") {
      await setupVite(app, server);
      log('Vite development server started successfully');
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on port 5000
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = 5000;
    server.listen(port, "0.0.0.0", () => {
      log(`Server running at http://0.0.0.0:${port}`);
      log(`App accessible via webview`);
      log(`Direct URL: https://${process.env.REPL_SLUG}-${process.env.REPL_OWNER}.replit.dev/`);
    }).on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Please stop any existing server instances.`);
        console.error('Try running: pkill -f "node.*server" or restart the workflow');
      } else {
        console.error('Server listen error:', err);
      }
      process.exit(1);
    });
    
  } catch (startupError) {
    console.error('Critical startup error:', startupError);
    process.exit(1);
  }
})();