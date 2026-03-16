import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { RoomLobby } from './pages/RoomLobby';
import { GameBoard } from './pages/GameBoard';
import { GameRejoin } from './pages/GameRejoin';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/lobby/:code" element={<RoomLobby />} />
      <Route path="/game" element={<GameBoard />} />
      <Route path="/game/:roomCode" element={<GameRejoin />} />
    </Routes>
  );
}

export default App;
