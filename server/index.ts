import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { registerRoutes } from "./routes";
import { log } from "./vite";

// Set Vite allowed hosts to fix "Blocked request" error
// process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = '.replit.dev'; // Removed as Vite is disabled

const app = express();
app.use(express.json({ limit: '1mb' })); // Limit request size
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

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
    
    // Register routes with enhanced error handling
    try {
      console.log('Setting up routes...');
      
      await registerRoutes(app, server);
      console.log('Routes registered successfully');
    } catch (routeError) {
      console.error('Error registering routes:', routeError);
      console.log('Starting with minimal functionality...');
      
      // Register minimal fallback routes
      app.get("/api/health", (req, res) => {
        res.json({ 
          status: "ok", 
          mode: "fallback",
          timestamp: new Date().toISOString()
        });
      });
      
      app.get("/api/auth/user", (req, res) => {
        res.json({ id: 'dev-user-123', name: 'Development User' });
      });

      // Catch-all for non-API routes in fallback mode
      app.get("*", (req, res) => {
        if (req.path.startsWith("/api/")) {
          res.status(503).json({ 
            error: "Database service temporarily unavailable",
            fallbackMode: true
          });
        } else {
          res.sendFile(path.join(process.cwd(), "client/dist/index.html"));
        }
      });
    }

    // Setup Vite dev server in development, serve static in production
    if (process.env.NODE_ENV !== "production") {
      const { setupVite } = await import("./vite.js");
      await setupVite(app, server);
    } else {
      const { serveStatic } = await import("./vite.js");
      serveStatic(app);
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


    // Cloud Run sets PORT env var; fall back to 3000 for local dev
    const port = parseInt(process.env.PORT || '3000', 10);
    server.listen(port, "0.0.0.0", () => {
      log(`Server running at http://0.0.0.0:${port}`);
      log(`App accessible via webview`);
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