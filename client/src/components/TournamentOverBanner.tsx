import React from 'react';

interface TournamentOverBannerProps {
  winnerName: string;
}

export default function TournamentOverBanner({ winnerName }: TournamentOverBannerProps) {
  return (
    <div className="mb-6 relative overflow-hidden">
      <div className="bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 p-8 rounded-xl shadow-2xl border-4 border-yellow-300">
        <div className="text-center">
          <div className="text-6xl md:text-8xl font-black text-white drop-shadow-lg mb-4 animate-pulse">
            🏆 TOURNAMENT OVER 🏆
          </div>
          <div className="text-2xl md:text-3xl font-bold text-white drop-shadow-md mb-2">
            WINNER: {winnerName}
          </div>
          <div className="text-lg text-yellow-100">
            Congratulations on your victory!
          </div>
        </div>
        {/* Decorative elements */}
        <div className="absolute top-4 left-4 text-4xl animate-bounce">🎉</div>
        <div className="absolute top-4 right-4 text-4xl animate-bounce delay-150">🎊</div>
        <div className="absolute bottom-4 left-8 text-3xl animate-pulse">✨</div>
        <div className="absolute bottom-4 right-8 text-3xl animate-pulse delay-300">⭐</div>
      </div>
    </div>
  );
}
