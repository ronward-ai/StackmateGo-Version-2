import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Timer, Trophy } from 'lucide-react';

export default function Navigation() {
  const [location] = useLocation();

  return (
    <nav className="flex justify-center mb-6">
      <div className="flex space-x-2 bg-muted/30 p-1 rounded-lg">
        <Link href="/">
          <Button 
            variant={location === '/' ? 'default' : 'ghost'}
            size="sm"
            className="flex items-center"
          >
            <Timer className="h-4 w-4 mr-2" />
            Tournament Timer
          </Button>
        </Link>
        {location === '/league' && (
          <Link href="/league">
            <Button 
              variant="default"
              size="sm"
              className="flex items-center"
            >
              <Trophy className="h-4 w-4 mr-2" />
              League Mode
            </Button>
          </Link>
        )}
      </div>
    </nav>
  );
}