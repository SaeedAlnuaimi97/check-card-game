import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { RoomLobby } from './pages/RoomLobby';
import { GameBoard } from './pages/GameBoard';
import { Leaderboard } from './pages/Leaderboard';
import { LobbyJoin } from './pages/LobbyJoin';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room" element={<RoomLobby />} />
      <Route path="/game" element={<GameBoard />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
      <Route path="/lobby/:code" element={<LobbyJoin />} />
    </Routes>
  );
}

export default App;
