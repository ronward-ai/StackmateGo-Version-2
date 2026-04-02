import React, { useState } from 'react';
import { Button } from './ui/button';
import { useAuth } from '../hooks/useAuth';
import { AuthModal } from './AuthModal';
import { User, LogOut, UserCircle, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';

export function Navigation() {
  const { user, isAuthenticated } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <nav className="flex items-center justify-between px-4 py-3 bg-gray-900/50 backdrop-blur-sm border-b border-gray-700">
      <div className="flex items-center space-x-3">
        <h1 className="text-xl font-bold text-white">StackMate Go</h1>
      </div>
      <div className="flex items-center gap-4">
        {isAuthenticated ? (
          <Button 
            variant="ghost"
            size="sm"
            onClick={() => setShowAuthModal(true)}
            className="text-gray-300 hover:text-white hover:bg-gray-800"
          >
            <User className="h-4 w-4 mr-2" />
            {user && ('playerName' in user ? user.playerName : user.name || user.email || 'Account')}
          </Button>
        ) : (
          <Button 
            variant="ghost"
            size="sm"
            onClick={() => setShowAuthModal(true)}
            className="text-gray-300 hover:text-white hover:bg-gray-800"
          >
            <User className="h-4 w-4 mr-2" />
            Login
          </Button>
        )}
      </div>
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </nav>
  );
}