import { type Express } from "express";
import { Server } from "socket.io";

// In-memory tournament storage
const tournaments = new Map();

// Rate limiting for 404 prevention
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 5000; // 5 seconds
const MAX_REQUESTS = 3;

// Create a default tournament for testing
const createDefaultTournament = () => {
  const defaultTournament = {
    id: 'default-test-tournament',
    name: 'Default Test Tournament',
    currentLevel: 1,
    secondsLeft: 900,
    isRunning: false,
    status: 'active',
    participantCode: 'TEST123',
    directorCode: 'DIR456',
    buyIn: 10,
    players: [],
    tables: [],
    blindLevels: [
      { small: 25, big: 50, ante: 0, duration: 15 },
      { small: 50, big: 100, ante: 0, duration: 15 },
      { small: 75, big: 150, ante: 0, duration: 15 }
    ],
    settings: {
      enableSounds: true,
      enableVoice: true,
      showSeconds: true,
      showNextLevel: true,
      currency: '£',
      tables: {
        numberOfTables: 1,
        seatsPerTable: 9,
        tableNames: ['Table 1']
      }
    },
    prizeStructure: {
      buyIn: 10,
      enableBounties: false,
      bountyAmount: 0,
      manualPayouts: []
    }
  };

  tournaments.set(defaultTournament.id, defaultTournament);
  console.log('Created default tournament:', defaultTournament.id);
  return defaultTournament;
};

// Initialize with default tournament
createDefaultTournament();

export function registerRoutes(app: Express, server: any) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Basic API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Tournament API routes
  app.post("/api/tournaments", (req, res) => {
    const tournamentData = req.body;

    // Create a new tournament with a unique ID
    const tournamentId = Math.random().toString(36).substr(2, 9);
    const newTournament = {
      id: tournamentId,
      name: tournamentData.name || "Tournament",
      currentLevel: tournamentData.currentLevel || 0,
      secondsLeft: tournamentData.secondsLeft || 900,
      isRunning: tournamentData.isRunning || false,
      status: "active",
      participantCode: tournamentData.participantCode,
      directorCode: Math.floor(100000 + Math.random() * 900000).toString(),
      buyIn: tournamentData.buyIn || 10,
      players: [],
      tables: [],
      blindLevels: [
        { small: 25, big: 50, ante: 0, duration: 15 },
        { small: 50, big: 100, ante: 0, duration: 15 },
        { small: 75, big: 150, ante: 0, duration: 15 }
      ],
      settings: {
        enableSounds: tournamentData.enableSounds || true,
        enableVoice: tournamentData.enableVoice || true,
        showSeconds: tournamentData.showSeconds || true,
        showNextLevel: tournamentData.showNextLevel || true,
        currency: '£',
        tables: {
          numberOfTables: 1,
          seatsPerTable: 9,
          tableNames: ['Table 1']
        }
      },
      prizeStructure: {
        buyIn: tournamentData.buyIn || 10,
        enableBounties: false,
        bountyAmount: 0,
        manualPayouts: []
      }
    };

    // Store in memory with both the ID as key and ensure it's accessible
    tournaments.set(tournamentId, newTournament);

    console.log("Created tournament:", newTournament.id, "- Total tournaments:", tournaments.size);
    console.log("Available tournament IDs:", Array.from(tournaments.keys()));

    res.json(newTournament);
  });

  app.get("/api/tournament/:id", (req, res) => {
    res.json({
      id: req.params.id,
      name: "Tournament",
      status: "active"
    });
  });

  // Get tournament by ID
  app.get('/api/tournaments/:id', (req, res) => {
    try {
      const tournamentId = req.params.id;

      // Rate limiting to prevent spam
      const clientKey = `${req.ip}-${tournamentId}`;
      const now = Date.now();
      const requests = rateLimitMap.get(clientKey) || [];
      const recentRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);

      if (recentRequests.length >= MAX_REQUESTS) {
        console.log(`Rate limited request for ${tournamentId} from ${req.ip}`);
        return res.status(429).json({ error: 'Too many requests' });
      }

      recentRequests.push(now);
      rateLimitMap.set(clientKey, recentRequests);

      let tournament = tournaments.get(tournamentId);

      // If not found, try to find by ID in the values (in case of ID mismatch)
      if (!tournament) {
        const tournamentArray = Array.from(tournaments.values());
        tournament = tournamentArray.find(t => t.id === tournamentId);
      }

      if (!tournament) {
        console.log('Tournament not found:', tournamentId);
        console.log('Available tournaments:', Array.from(tournaments.keys()));
        console.log('Available tournament IDs:', Array.from(tournaments.values()).map(t => t.id));

        // Create missing tournament automatically to prevent repeated 404s
        const newTournament = {
          id: tournamentId,
          name: `Tournament ${new Date().toLocaleDateString()}`,
          currentLevel: 0, // 0-based index for frontend
          secondsLeft: 900, // 15 minutes in seconds
          isRunning: false,
          status: 'active',
          participantCode: Math.random().toString(36).substr(2, 6).toUpperCase(),
          directorCode: Math.floor(100000 + Math.random() * 900000).toString(),
          buyIn: 10,
          players: [],
          tables: [],
          blindLevels: [
            { small: 25, big: 50, ante: 0, duration: 900 }, // Convert to seconds
            { small: 50, big: 100, ante: 0, duration: 900 },
            { small: 75, big: 150, ante: 0, duration: 900 },
            { small: 100, big: 200, ante: 0, duration: 900 },
            { small: 150, big: 300, ante: 0, duration: 900 }
          ],
          settings: {
            enableSounds: true,
            enableVoice: true,
            showSeconds: true,
            showNextLevel: true,
            currency: '£',
            tables: {
              numberOfTables: 1,
              seatsPerTable: 9,
              tableNames: ['Table 1']
            }
          },
          prizeStructure: {
            buyIn: 10,
            enableBounties: false,
            bountyAmount: 0,
            manualPayouts: []
          }
        };
        tournaments.set(tournamentId, newTournament);
        console.log('Auto-created tournament:', tournamentId, 'with structure:', newTournament);
        return res.json(newTournament);
      }

      // Ensure the tournament has the correct structure for the frontend
      const formattedTournament = {
        ...tournament,
        // Ensure currentLevel is 0-based for frontend
        currentLevel: typeof tournament.currentLevel === 'number' ? 
          (tournament.currentLevel > 0 ? tournament.currentLevel - 1 : 0) : 0,
        // Ensure blind levels have duration in seconds
        blindLevels: tournament.blindLevels?.map(level => ({
          ...level,
          small: level.small || level.smallBlind || 25,
          big: level.big || level.bigBlind || 50,
          ante: level.ante || 0,
          duration: typeof level.duration === 'number' ? 
            (level.duration < 100 ? level.duration * 60 : level.duration) : 900
        })) || [
          { small: 25, big: 50, ante: 0, duration: 900 },
          { small: 50, big: 100, ante: 0, duration: 900 },
          { small: 75, big: 150, ante: 0, duration: 900 }
        ],
        players: tournament.players || [],
        tables: tournament.tables || [],
        settings: {
          enableSounds: true,
          enableVoice: true,
          showSeconds: true,
          showNextLevel: true,
          currency: '£',
          tables: {
            numberOfTables: 1,
            seatsPerTable: 9,
            tableNames: ['Table 1']
          },
          ...tournament.settings
        },
        prizeStructure: {
          buyIn: 10,
          enableBounties: false,
          bountyAmount: 0,
          manualPayouts: [],
          ...tournament.prizeStructure
        }
      };

      console.log('Tournament found and formatted:', formattedTournament.id, formattedTournament.name);
      res.json(formattedTournament);
    } catch (error) {
      console.error('Error getting tournament:', error);
      res.status(500).json({ error: 'Failed to get tournament' });
    }
  });

  app.post("/api/tournament/:id/update", (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    // Broadcast the update to all connected clients
    io.to(`tournament:${id}`).emit("tournament-update", updateData);

    res.json({ success: true });
  });

  // Timer update endpoint for real-time tournament updates
  app.post("/api/tournaments/:id/timer-update", (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    console.log(`Broadcasting timer update for tournament ${id}:`, updateData);

    // Update tournament in memory
    let tournament = tournaments.get(id);
    if (!tournament) {
      // Try to find by ID in values
      const tournamentArray = Array.from(tournaments.values());
      tournament = tournamentArray.find(t => t.id === id);
    }

    if (tournament) {
      const updatedTournament = { 
        ...tournament, 
        ...updateData,
        // Merge arrays properly
        players: updateData.players || tournament.players,
        blindLevels: updateData.blindLevels || tournament.blindLevels,
        settings: { 
          ...tournament.settings, 
          ...updateData.settings,
          // Ensure tables settings are properly merged
          tables: {
            ...tournament.settings?.tables,
            ...updateData.settings?.tables
          }
        }
      };
      tournaments.set(id, updatedTournament);

      // Broadcast the complete tournament state to all viewers
      io.to(`tournament:${id}`).emit("tournament_updated", {
        type: 'tournament_updated',
        tournamentId: id,
        tournament: updatedTournament
      });
    } else {
      console.log(`Tournament ${id} not found for timer update`);
    }

    res.json({ success: true });
  });

  // Participant update endpoint
  app.post("/api/tournaments/:id/participant-update", (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      console.log(`Broadcasting participant update for tournament ${id}`);

      // Update tournament in memory if data provided
      if (updateData) {
        const tournament = tournaments.get(id);
        if (tournament) {
          tournaments.set(id, { ...tournament, ...updateData });
        }
      }

      // Broadcast to all clients subscribed to this tournament
      io.to(`tournament:${id}`).emit("tournament_updated", {
        type: 'tournament_updated',
        tournamentId: id,
        tournament: tournaments.get(id)
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating participant:', error);
      res.status(500).json({ error: 'Failed to update participant' });
    }
  });

  // Details update endpoint
  app.post("/api/tournaments/:id/details-update", (req, res) => {
    try {
      const { id } = req.params;

      console.log(`Broadcasting details update for tournament ${id}`);

      // Broadcast to all clients subscribed to this tournament
      io.to(`tournament:${id}`).emit("tournament_updated", {
        type: 'tournament_updated',
        tournamentId: id
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating details:', error);
      res.status(500).json({ error: 'Failed to update details' });
    }
  });

  // Director login endpoint
  app.post("/api/tournaments/:id/director-login", (req, res) => {
    try {
      const { id } = req.params;
      const { directorCode } = req.body;

      console.log(`Director login attempt for tournament ${id}`);

      // Get tournament
      let tournament = tournaments.get(id);
      if (!tournament) {
        // Try to find by ID in values
        const tournamentArray = Array.from(tournaments.values());
        tournament = tournamentArray.find(t => t.id === id);
      }

      if (!tournament) {
        return res.status(404).json({ error: 'Tournament not found' });
      }

      // Check director code
      if (!directorCode || directorCode.trim().toUpperCase() !== tournament.directorCode) {
        return res.status(401).json({ error: 'Invalid director code' });
      }

      console.log(`Director login successful for tournament ${id}`);
      res.json({ success: true, tournament });
    } catch (error) {
      console.error('Error during director login:', error);
      res.status(500).json({ error: 'Failed to authenticate director' });
    }
  });

  // Socket.IO connection handling
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join-tournament", (tournamentId) => {
      socket.join(`tournament:${tournamentId}`);
      console.log(`Client ${socket.id} joined tournament ${tournamentId}`);
    });

    // Director coordination events
    socket.on("join-director-coordination", (data) => {
      const { tournamentId, directorId } = data;
      socket.join(`director:${tournamentId}`);
      socket.join(`tournament:${tournamentId}`); // Also join main tournament room
      socket.directorId = directorId;
      socket.tournamentId = tournamentId;

      // Notify other directors
      socket.to(`director:${tournamentId}`).emit("director-joined", { directorId });

      // Send current tournament state to newly joined director
      const tournament = tournaments.get(tournamentId);
      if (tournament) {
        socket.emit("tournament_updated", {
          type: 'tournament_updated',
          tournamentId,
          tournament
        });
      }

      console.log(`Director ${directorId} joined coordination for tournament ${tournamentId}`);
    });

    socket.on("director-action", (data) => {
      const { tournamentId, action, actionData } = data;

      // Update tournament in memory if actionData provided
      if (actionData) {
        let tournament = tournaments.get(tournamentId);
        if (!tournament) {
          // Try to find by ID in values
          const tournamentArray = Array.from(tournaments.values());
          tournament = tournamentArray.find(t => t.id === tournamentId);
        }

        if (tournament) {
          tournaments.set(tournamentId, { ...tournament, ...actionData });
        }
      }

      const currentTournament = tournaments.get(tournamentId);

      // Broadcast to ALL connected clients for this tournament (directors AND participants)
      io.to(`tournament:${tournamentId}`).emit("tournament_updated", {
        type: 'tournament_updated',
        tournamentId,
        tournament: currentTournament
      });

      // Also broadcast to director coordination room
      socket.to(`director:${tournamentId}`).emit("director-action", {
        directorId: socket.directorId || "Director",
        action,
        actionData: currentTournament,
        timestamp: new Date().toISOString()
      });

      console.log(`Director action broadcasted for tournament ${tournamentId}: ${action}`);
    });

    socket.on("subscribe_tournament", (data) => {
      const tournamentId = data.tournamentId || data;
      socket.join(`tournament:${tournamentId}`);
      console.log(`Client ${socket.id} subscribed to tournament ${tournamentId}`);
    });

    socket.on("tournament-update", (data) => {
      console.log("Broadcasting tournament update:", data);
      socket.to(`tournament:${data.tournamentId}`).emit("tournament-update", data);
      io.to(`tournament:${data.tournamentId}`).emit("tournament_updated", data);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
}