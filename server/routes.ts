import { type Express } from "express";
import { Server as HTTPServer } from 'http';

export async function registerRoutes(app: Express, server: HTTPServer): Promise<HTTPServer> {
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString()
    });
  });

  return server;
}
