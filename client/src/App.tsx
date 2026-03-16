import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { RoomLobby } from './pages/RoomLobby';
import { GameBoard } from './pages/GameBoard';
import { LobbyJoin } from './pages/LobbyJoin';
import { GameRejoin } from './pages/GameRejoin';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room" element={<RoomLobby />} />
      <Route path="/game" element={<GameBoard />} />
      <Route path="/game/:roomCode" element={<GameRejoin />} />
      <Route path="/lobby/:code" element={<LobbyJoin />} />
    </Routes>
  );
}

export default App;
