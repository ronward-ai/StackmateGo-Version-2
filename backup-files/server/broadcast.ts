
let broadcastFunction: ((tournamentId: string | number, tournament: any) => void) | null = null;

export const setBroadcastFunction = (fn: (tournamentId: string | number, tournament: any) => void) => {
  broadcastFunction = fn;
};

export const broadcastTournamentUpdate = (tournamentId: string | number, tournament: any) => {
  if (broadcastFunction) {
    broadcastFunction(tournamentId, tournament);
  }
};
