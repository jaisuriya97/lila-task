import React, { useState, useEffect, useRef } from 'react';
import { Client } from '@heroiclabs/nakama-js';
import './App.css';

const NAKAMA_CONFIG = {
  serverKey: 'defaultkey',
  host: '98.82.120.130',
  port: '7350',
  useSSL: false,
};

const IconX = () => <svg viewBox="0 0 100 100" className="icon-svg icon-x"><path d="M 20 20 L 80 80 M 80 20 L 20 80" /></svg>;
const IconO = () => <svg viewBox="0 0 100 100" className="icon-svg icon-o"><circle cx="50" cy="50" r="35" /></svg>;
const Spinner = () => <div className="spinner"></div>;

export default function App() {
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [scores, setScores] = useState({ wins: 0, losses: 0, draws: 0 });

  const [gameState, setGameState] = useState({
    board: Array(9).fill(0),
    activePlayerId: null,
    myMark: null,
    usernames: {},
    status: 'lobby',
    winner: null,
    deadline: 0
  });

  const [timeLeft, setTimeLeft] = useState("--");
  const [gameDuration, setGameDuration] = useState("0s");
  const [opponentName, setOpponentName] = useState("OPPONENT");
  const [pendingIndex, setPendingIndex] = useState(null);

  const sessionRef = useRef(null);
  const socketRef = useRef(null);
  const matchIdRef = useRef(null);
  const matchStartRef = useRef(null);


  const getMyId = () => sessionRef.current ? (sessionRef.current.user_id || sessionRef.current.userId) : null;

  const connectToNakama = async () => {
    if (!username.trim()) return alert("Please enter a username");
    try {
      const client = new Client(NAKAMA_CONFIG.serverKey, NAKAMA_CONFIG.host, NAKAMA_CONFIG.port, NAKAMA_CONFIG.useSSL);

      let deviceId = sessionStorage.getItem('deviceId');
      if (!deviceId) {
        deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (Math.random() * 16 | 0).toString(16));
        sessionStorage.setItem('deviceId', deviceId);
      }

      const newSession = await client.authenticateDevice(deviceId, true, username);
      sessionRef.current = newSession;
      setIsLoggedIn(true);
      const socket = client.createSocket(false, false);
      await socket.connect(newSession, true);
      socketRef.current = socket;
      setIsConnected(true);
      socket.ondisconnect = () => setIsConnected(false);
      socket.onmatchdata = (matchState) => {
        if (matchState.op_code === 2) {
          const data = JSON.parse(new TextDecoder().decode(matchState.data));

          setPendingIndex(null); 
          if (data.usernames) {
            const myId = getMyId();
            const oppId = Object.keys(data.usernames).find(id => id !== myId);
            if (oppId) setOpponentName(data.usernames[oppId]);
          }

          setGameState(prev => {
            const myId = getMyId();
            let newMark = prev.myMark;
            if (data.marks && myId && data.marks[myId]) {
              newMark = data.marks[myId];
            }

            return {
              ...prev,
              board: data.board,
              activePlayerId: data.activePlayerId,
              usernames: data.usernames || prev.usernames,
              marks: data.marks || prev.marks,
              myMark: newMark,
              winner: data.winner || (data.draw ? 'draw' : null),
              deadline: data.deadline || prev.deadline,
              status: (data.winner || data.draw) ? 'finished' : 'playing'
            };
          });
        }
      };

      socket.onmatchmakermatched = async (matched) => {
        const match = await socket.joinMatch(matched.match_id);
        matchIdRef.current = match.match_id;
        setGameDuration("0s");
        matchStartRef.current = null;
      };
    } catch (e) { console.error(e); alert("Connect Failed"); }
  };

  useEffect(() => {
    if (gameState.status !== 'playing' || !gameState.deadline) return;
    const interval = setInterval(() => {
      const delta = Math.ceil((gameState.deadline - Date.now()) / 1000);
      setTimeLeft(Math.max(0, delta));
    }, 250);
    return () => clearInterval(interval);
  }, [gameState.deadline, gameState.status]);

  useEffect(() => {
    if (gameState.status === 'playing' && !matchStartRef.current) {
      matchStartRef.current = Date.now();
    } else if (gameState.status === 'finished' && matchStartRef.current) {
      const seconds = Math.floor((Date.now() - matchStartRef.current) / 1000);
      setGameDuration(`${seconds}s`);
      matchStartRef.current = null;

      setScores(s => {
        if (gameState.winner === 'draw') return { ...s, draws: s.draws + 1 };
        if (gameState.winner === gameState.myMark) return { ...s, wins: s.wins + 1 };
        return { ...s, losses: s.losses + 1 };
      });
    } else if (gameState.status === 'matching') {
      matchStartRef.current = null;
    }
  }, [gameState.status, gameState.winner]);

  const findMatch = async () => {
    setGameState(prev => ({ ...prev, status: 'matching' }));
    setOpponentName("SEARCHING...");
    await socketRef.current.addMatchmaker("*", 2, 2);
  };

  const handleCellClick = (index) => {
    if (gameState.status !== 'playing') return;
    if (gameState.board[index] !== 0) return;

    const myId = getMyId();
    if (gameState.activePlayerId !== myId) return;
    if (pendingIndex !== null) return;

    setPendingIndex(index);
    socketRef.current.sendMatchState(matchIdRef.current, 1, JSON.stringify({ index }));
  };



  const getStatusText = () => {
    if (gameState.status === 'lobby') return "Online Multiplayer";
    if (gameState.status === 'matching') return "Searching...";
    if (gameState.status === 'finished') return "GAME OVER";

    const myId = getMyId();
    if (gameState.activePlayerId === myId) return "YOUR TURN";

    const opponentId = Object.keys(gameState.usernames).find(id => id !== myId);
    const name = gameState.usernames[opponentId];
    return name ? `${name}'s TURN` : "OPPONENT'S TURN";
  };

  if (!isLoggedIn) {
    return (
      <div className="app-container">
        <div className="header"><h1 className="title">Tic-Tac-Toe</h1></div>
        <div className="login-container">
          <h2>Enter Name</h2>
          <input type="text" className="login-input" placeholder="What they call you ?" value={username} onChange={(e) => setUsername(e.target.value)} />
          <button className="btn-primary" onClick={connectToNakama}>START</button>
        </div>
      </div>
    );
  }

  const isMyTurn = gameState.status === 'playing' && gameState.activePlayerId === getMyId();

  return (
    <div className="app-container">
      <header className="header"><h1 className="title">Tic-Tac-Toe</h1></header>

      <div className="info-bar">
        <div className="player-info">
          <div className="player-name">{username} (You)</div>
          <div className="score">W:{scores.wins} L:{scores.losses} D:{scores.draws}</div>
        </div>
        <div className={`timer-box ${timeLeft < 10 && gameState.status === 'playing' ? 'warning' : ''}`}>
          {gameState.status === 'playing' ? timeLeft : '--'}
        </div>
        <div className="player-info" style={{ alignItems: 'flex-end' }}>
          <div className="player-name">{opponentName}</div>
          <div className="score" style={{ fontWeight: 'bold', color: isMyTurn ? '#4caf50' : '#666' }}>
            {getStatusText()}
          </div>
        </div>
      </div>

      <div className="board-container">
        <div className="board">
          {gameState.board.map((cell, idx) => (
            <div key={idx} className={`cell ${isMyTurn && cell === 0 ? 'interactive' : ''}`} onClick={() => handleCellClick(idx)}>
              {cell === 1 && <IconX />}
              {cell === 2 && <IconO />}
              {pendingIndex === idx && <Spinner />}
            </div>
          ))}
        </div>

        {gameState.status !== 'playing' && (
          <div className="overlay">
            {gameState.status === 'finished' && (
              <>
                <div className="result-title" style={{ color: gameState.winner === gameState.myMark ? '#4caf50' : '#f44336' }}>
                  {gameState.winner === gameState.myMark ? "VICTORY" : gameState.winner === 'draw' ? "DRAW" : "DEFEAT"}
                </div>
                <div className="stats-grid">
                  <div><span className="stat-label">Time</span><span className="stat-value">{gameDuration}</span></div>
                  <div><span className="stat-label">Result</span><span className="stat-value">{gameState.winner === 'draw' ? 'D' : gameState.winner === gameState.myMark ? 'W' : 'L'}</span></div>
                </div>
              </>
            )}
            <button className="btn-primary" onClick={findMatch} disabled={!isConnected || gameState.status === 'matching'}>
              {gameState.status === 'matching' ? <><Spinner /> Searching...</> : gameState.status === 'finished' ? 'PLAY AGAIN' : 'FIND MATCH'}
            </button>
          </div>
        )}
      </div>

      <footer className="footer">
        <div className="connection-status">
          <span className={`dot ${isConnected ? 'online' : ''}`}></span>
          {isConnected ? "Connected" : "Disconnected"}
        </div>
      </footer>
    </div>
  );
}