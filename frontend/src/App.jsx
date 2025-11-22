import React, { useState, useEffect, useRef } from 'react';
import { Client } from '@heroiclabs/nakama-js';
import './App.css';

const NAKAMA_CONFIG = {
  serverKey: 'defaultkey',
  host: '3.236.209.129', // Ensure this is your AWS IP
  port: '7350',
  useSSL: false,
};

// --- ICONS ---
const IconX = () => (
  <svg viewBox="0 0 100 100" className="icon-svg icon-x">
    <path d="M 25 25 L 75 75 M 75 25 L 25 75" />
  </svg>
);

const IconO = () => (
  <svg viewBox="0 0 100 100" className="icon-svg icon-o">
    <circle cx="50" cy="50" r="30" />
  </svg>
);

const Spinner = () => (
  <div className="spinner-small" style={{ width: '20px', height: '20px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
);

const FullscreenIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
  </svg>
);

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [session, setSession] = useState(null);
  const socketRef = useRef(null);
  const matchIdRef = useRef(null);

  const [gameState, setGameState] = useState({
    board: Array(9).fill(0),
    turn: 1,
    myMark: null,
    status: 'lobby',
    winner: null
  });

  // Track pending move to show loading spinner on specific cell
  const [pendingMove, setPendingMove] = useState(null);

  // --- NAKAMA LOGIC ---
  const initNakama = async () => {
    try {
      const client = new Client(NAKAMA_CONFIG.serverKey, NAKAMA_CONFIG.host, NAKAMA_CONFIG.port, NAKAMA_CONFIG.useSSL);

      let deviceId = sessionStorage.getItem('deviceId');
      if (!deviceId) {
        // Simple UUID generator
        deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
        sessionStorage.setItem('deviceId', deviceId);
      }

      const newSession = await client.authenticateDevice(deviceId, true, "Player_" + Math.floor(Math.random() * 1000));
      setSession(newSession);

      const socket = client.createSocket(false, false);
      await socket.connect(newSession, true);
      socketRef.current = socket;
      setIsConnected(true);

      socket.onmatchdata = (matchState) => {
        if (matchState.op_code === 2) {
          const data = JSON.parse(new TextDecoder().decode(matchState.data));

          // SERVER IS AUTHORITY: Update state fully from server message
          setGameState(prev => ({
            ...prev,
            board: data.board,
            turn: data.turn,
            winner: data.winner || (data.draw ? 'draw' : null),
            status: (data.winner || data.draw) ? 'finished' : 'playing'
          }));

          // Clear pending move since server confirmed update
          setPendingMove(null);
        }
      };

      socket.onmatchmakermatched = async (matched) => {
        const match = await socket.joinMatch(matched.match_id);
        matchIdRef.current = match.match_id;

        const myId = newSession.user_id;
        const users = matched.users.sort((a, b) => a.numeric_id - b.numeric_id);
        const amIPlayerOne = users[0].presence.user_id === myId;

        setGameState(prev => ({
          ...prev,
          status: 'playing',
          myMark: amIPlayerOne ? 1 : 2,
        }));
      };
    } catch (error) { console.error(error); }
  };

  const findMatch = async () => {
    setGameState(prev => ({ ...prev, status: 'matching' }));
    await socketRef.current.addMatchmaker("*", 2, 2);
  };

  const sendMove = async (index) => {
    const opCode = 1;
    if (socketRef.current) {
      await socketRef.current.sendMatchState(matchIdRef.current, opCode, JSON.stringify({ index }));
    }
  };

  const handleCellClick = (index) => {
    // Validations
    if (gameState.status !== 'playing') return;
    if (gameState.board[index] !== 0) return;
    if (gameState.turn !== gameState.myMark) return;
    if (pendingMove !== null) return; // Prevent double clicks

    // 1. Set Pending State (Show spinner locally)
    setPendingMove(index);

    // 2. Send to Server (Do NOT update board yet)
    sendMove(index);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => console.log(e));
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => { initNakama(); }, []);

  // --- RENDER HELPERS ---
  const isMyTurn = gameState.status === 'playing' && gameState.turn === gameState.myMark;

  const getStatusText = () => {
    if (gameState.status === 'lobby') return "Online Multiplayer";
    if (gameState.status === 'matching') return "Scanning...";
    if (gameState.status === 'finished') {
      if (gameState.winner === 'draw') return "Draw Game";
      return gameState.winner === gameState.myMark ? "Victory" : "Defeat";
    }
    return isMyTurn ? "Your Turn" : "Enemy Turn";
  };

  const getStatusClass = () => {
    if (isMyTurn) return 'status-badge p1-turn';
    if (gameState.status === 'playing') return 'status-badge p2-turn';
    return 'status-badge';
  };

  return (
    <div className="app-container">

      <button className="fullscreen-btn" onClick={toggleFullscreen} title="Fullscreen">
        <FullscreenIcon />
      </button>

      <header className="header">
        <h1 className="title neon-text">NEO<span>TAC</span></h1>
        <div className={getStatusClass()}>
          {getStatusText()}
        </div>
      </header>

      <div className="board-container">
        <div className="board">
          {gameState.board.map((cell, idx) => (
            <div
              key={idx}
              className={`cell ${isMyTurn && cell === 0 ? 'interactive' : ''}`}
              onClick={() => handleCellClick(idx)}
            >
              {/* Logic: Show Icon if set, Show Spinner if pending, else Empty */}
              {cell === 1 && <IconX />}
              {cell === 2 && <IconO />}
              {pendingMove === idx && cell === 0 && <Spinner />}
            </div>
          ))}
        </div>

        {gameState.status !== 'playing' && (
          <div className="overlay">
            {gameState.status === 'finished' && (
              <div className="result-text">
                {gameState.winner === gameState.myMark ? "🎉 Victory" : gameState.winner === 'draw' ? "🤝 Draw" : "💀 Defeat"}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={findMatch}
              disabled={!isConnected || gameState.status === 'matching'}
            >
              {gameState.status === 'matching' ? (
                <>
                  <span className="spinner"></span> Finding Match...
                </>
              ) : gameState.status === 'finished' ? 'Play Again' : 'Find Match'}
            </button>
          </div>
        )}
      </div>

      <footer className="footer">
        {gameState.myMark ? (
          <div className="player-indicator">
            PLAYING AS <span className={gameState.myMark === 2 ? 'o' : ''}>{gameState.myMark === 1 ? "X" : "O"}</span>
          </div>
        ) : (
          <div className="connection-status">
            <span className={`dot ${isConnected ? 'online' : ''}`}></span>
            {isConnected ? "SERVER ONLINE" : "CONNECTING..."}
          </div>
        )}
      </footer>

    </div>
  );
}