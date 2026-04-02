
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Users, Eye, Shield, AlertTriangle } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface DirectorCoordinationPanelProps {
  tournamentId: string;
  currentDirector: string;
}

export default function DirectorCoordinationPanel({ tournamentId, currentDirector }: DirectorCoordinationPanelProps) {
  const [activeDirectors, setActiveDirectors] = useState<string[]>([currentDirector]);
  const [lastAction, setLastAction] = useState<{ director: string; action: string; timestamp: Date } | null>(null);
  const [coordinationMode, setCoordinationMode] = useState<'collaborative' | 'primary-backup'>('collaborative');
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Socket.IO connection for director coordination
    const newSocket = io(window.location.origin);
    
    newSocket.on('connect', () => {
      console.log('Director connected to socket:', newSocket.id);
      // Join director coordination room
      newSocket.emit('join-director-coordination', {
        tournamentId,
        directorId: currentDirector
      });
    });

    newSocket.on('director-joined', (data) => {
      console.log('Director joined:', data.directorId);
      setActiveDirectors(prev => {
        if (!prev.includes(data.directorId)) {
          return [...prev, data.directorId];
        }
        return prev;
      });
    });

    newSocket.on('director-action', (data) => {
      console.log('Director action received:', data);
      setLastAction({
        director: data.directorId,
        action: data.action,
        timestamp: new Date(data.timestamp)
      });
      
      // Sync tournament state if provided and not from this director
      if (data.actionData && data.directorId !== currentDirector) {
        console.log('Syncing tournament state from director action:', data.actionData);
        window.dispatchEvent(new CustomEvent('tournament-sync', { 
          detail: { tournament: data.actionData } 
        }));
      }
    });

    // Listen for tournament updates to sync with main app
    newSocket.on('tournament_updated', (data) => {
      console.log('Tournament update received in director coordination:', data);
      window.dispatchEvent(new CustomEvent('tournament-sync', { detail: data }));
    });

    newSocket.on('disconnect', () => {
      console.log('Director disconnected');
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [tournamentId, currentDirector]);

  // Function to broadcast director actions
  const broadcastAction = (action: string) => {
    if (socket) {
      socket.emit('director-action', {
        tournamentId,
        action
      });
    }
  };

  if (activeDirectors.length <= 1) {
    return null; // Only show when multiple directors are active
  }

  return (
    <Card className="mb-4 border-blue-200 bg-blue-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4" />
          Director Coordination
          <Badge variant="secondary">{activeDirectors.length} Active</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Active Directors */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Active Directors:</p>
            <div className="flex gap-2 flex-wrap">
              {activeDirectors.map(director => (
                <Badge key={director} variant={director === currentDirector ? 'default' : 'secondary'}>
                  {director === currentDirector ? 'You' : director}
                </Badge>
              ))}
            </div>
          </div>

          {/* Last Action */}
          {lastAction && (
            <div className="p-2 bg-white rounded border">
              <p className="text-xs text-muted-foreground">
                Last action: <strong>{lastAction.director}</strong> {lastAction.action}
              </p>
              <p className="text-xs text-muted-foreground">
                {lastAction.timestamp.toLocaleTimeString()}
              </p>
            </div>
          )}

          {/* Coordination Mode */}
          <div className="flex gap-2">
            <Button
              variant={coordinationMode === 'collaborative' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCoordinationMode('collaborative')}
            >
              Collaborative
            </Button>
            <Button
              variant={coordinationMode === 'primary-backup' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCoordinationMode('primary-backup')}
            >
              Primary/Backup
            </Button>
          </div>

          {coordinationMode === 'collaborative' && (
            <div className="flex items-center gap-2 text-xs text-green-700">
              <Eye className="h-3 w-3" />
              All directors can make changes
            </div>
          )}

          {coordinationMode === 'primary-backup' && (
            <div className="flex items-center gap-2 text-xs text-orange-700">
              <AlertTriangle className="h-3 w-3" />
              Only primary director can make changes
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
