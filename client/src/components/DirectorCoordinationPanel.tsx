
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Users, Eye, Shield, AlertTriangle, UserCheck, Copy } from 'lucide-react';

interface DirectorCoordinationPanelProps {
  tournamentId: string;
  currentDirector: string;
}

export default function DirectorCoordinationPanel({ tournamentId, currentDirector }: DirectorCoordinationPanelProps) {
  const [activeDirectors, setActiveDirectors] = useState<string[]>([currentDirector]);
  const [lastAction, setLastAction] = useState<{ director: string; action: string; timestamp: Date } | null>(null);
  const [coordinationMode, setCoordinationMode] = useState<'collaborative' | 'primary-backup'>('collaborative');
  const [transferCode, setTransferCode] = useState<string | null>(null);
  const [showTransferCode, setShowTransferCode] = useState(false);

  // Generate transfer code
  const generateTransferCode = async () => {
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    setTransferCode(code);
    setShowTransferCode(true);

    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      
      const docRef = doc(db, 'activeTournaments', tournamentId.toString());
      await updateDoc(docRef, {
        transferCode: code,
        transferCodeGeneratedBy: currentDirector,
        transferCodeExpiresAt: Date.now() + 300000 // 5 minutes
      });
    } catch (error) {
      console.error('Failed to save transfer code to Firebase:', error);
    }

    // Auto-expire after 5 minutes
    setTimeout(async () => {
      setTransferCode(null);
      setShowTransferCode(false);
      
      try {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const docRef = doc(db, 'activeTournaments', tournamentId.toString());
        await updateDoc(docRef, {
          transferCode: null,
          transferCodeGeneratedBy: null,
          transferCodeExpiresAt: null
        });
      } catch (error) {
        console.error('Failed to clear transfer code:', error);
      }
    }, 300000);
  };

  // Copy transfer code to clipboard
  const copyTransferCode = () => {
    if (transferCode) {
      navigator.clipboard.writeText(transferCode);
    }
  };

  return (
    <Card className="mb-4 border-purple-200 bg-purple-50 dark:bg-purple-900/10 dark:border-purple-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Director Management
          {activeDirectors.length > 1 && (
            <Badge variant="secondary">{activeDirectors.length} Active</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Active Directors - Only show if multiple */}
          {activeDirectors.length > 1 && (
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
          )}

          {/* Last Action - Only show if multiple directors */}
          {activeDirectors.length > 1 && lastAction && (
            <div className="p-2 bg-white dark:bg-gray-800 rounded border">
              <p className="text-xs text-muted-foreground">
                Last action: <strong>{lastAction.director}</strong> {lastAction.action}
              </p>
              <p className="text-xs text-muted-foreground">
                {lastAction.timestamp.toLocaleTimeString()}
              </p>
            </div>
          )}

          {/* Coordination Mode - Only show if multiple directors */}
          {activeDirectors.length > 1 && (
            <>
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
                <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                  <Eye className="h-3 w-3" />
                  All directors can make changes
                </div>
              )}

              {coordinationMode === 'primary-backup' && (
                <div className="flex items-center gap-2 text-xs text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="h-3 w-3" />
                  Only primary director can make changes
                </div>
              )}
            </>
          )}

          {/* Director Transfer Section - Always visible */}
          <div className={activeDirectors.length > 1 ? "border-t pt-3 mt-3" : ""}>
            <p className="text-xs text-muted-foreground mb-2">
              {activeDirectors.length === 1 ? 'Hand Off to Another Director:' : 'Transfer Director Rights:'}
            </p>
            
            {!showTransferCode ? (
              <Button
                onClick={generateTransferCode}
                size="sm"
                data-testid="button-generate-transfer-code"
                className="w-full bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600"
              >
                <UserCheck className="mr-2 h-3 w-3" />
                Generate Transfer Code
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded">
                  <code className="flex-1 text-sm font-mono text-purple-800 dark:text-purple-200" data-testid="text-transfer-code">
                    {transferCode}
                  </code>
                  <Button
                    onClick={copyTransferCode}
                    variant="outline"
                    size="sm"
                    data-testid="button-copy-transfer-code"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-xs text-purple-600 dark:text-purple-400">
                  Share this code with the new director. They can enter it on the tournament access page. Expires in 5 minutes.
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
