import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  // Dynamic imports so vite is never loaded in production
  const { createServer: createViteServer, createLogger } = await import("vite");
  const { default: viteConfig } = await import("../vite.config.js");

  const viteLogger = createLogger();
  const resolvedConfig = typeof viteConfig === 'function' ? await viteConfig({ mode: 'development', command: 'serve' }) : viteConfig;
  const vite = await createViteServer({
    ...resolvedConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        // Don't exit process on Vite errors, just log them
      },
    },
    server: {
      middlewareMode: true,
      hmr: false, // Completely disable HMR
      watch: {
        usePolling: true,
        interval: 1000
      },
      host: '0.0.0.0',
      allowedHosts: true, // Allow all hosts
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      
      // Let Vite transform the HTML - this injects the proper module imports
      const html = await vite.transformIndexHtml(url, template);
      
      res.status(200).set({ 
        "Content-Type": "text/html",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist/public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Cache headers decide whether a device ever sees a new deploy.
  //
  // index.html names every hashed asset, so a browser holding an old copy keeps
  // requesting the old chunks and stays on the old app indefinitely. That is how
  // one device sat on a build from several deploys earlier while another had
  // moved on — and it looked like a bug in the app rather than a stale bundle.
  //
  // Assets are safe to cache hard because Vite puts a content hash in each
  // filename: a changed file is a changed URL. That is also what makes the
  // no-cache index cheap — a returning visitor revalidates one small document
  // and reuses everything else.
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}