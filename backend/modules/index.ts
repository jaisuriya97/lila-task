interface GameState {
  board: number[];
  marks: { [userId: string]: number }; // 1=X, 2=O
  players: string[]; // List of UserIDs
  turn: number; // 1 or 2
  winner: number | null;
  draw: boolean;
}

const OP_CODE_MOVE = 1;
const OP_CODE_STATE_UPDATE = 2;

// --- HANDLERS ---

const matchInit = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: { [key: string]: any }
) {
  const state: GameState = {
    board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    marks: {},
    players: [],
    turn: 1, // X always starts
    winner: null,
    draw: false,
  };

  return { state, tickRate: 1, label: "tictactoe-standard" };
};

const matchJoinAttempt = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: GameState,
  presence: nkruntime.Presence
) {
  // STRICT 1v1: Allow max 2 players per match instance
  if (state.players.length >= 2) {
    return { state, accept: false, rejectMessage: "Match full" };
  }
  return { state, accept: true };
};

const matchJoin = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: GameState,
  presences: nkruntime.Presence[]
) {
  for (const presence of presences) {
    state.players.push(presence.userId);
    // First player = 1 (X), Second player = 2 (O)
    state.marks[presence.userId] = state.players.length;
  }

  // Broadcast start ONLY when we have 2 players
  if (state.players.length === 2) {
    dispatcher.broadcastMessage(
      OP_CODE_STATE_UPDATE,
      JSON.stringify({
        board: state.board,
        turn: state.turn,
        status: "playing",
      })
    );
  }

  return { state };
};

const matchLoop = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: GameState,
  messages: nkruntime.MatchMessage[]
) {
  if (state.winner || state.draw) return null;

  for (const message of messages) {
    if (message.opCode === OP_CODE_MOVE) {
      const senderId = message.sender.userId;
      const mark = state.marks[senderId];

      // 1. Validate Turn
      if (mark !== state.turn) continue;

      // 2. Parse Move
      let data;
      try {
        data = JSON.parse(nk.binaryToString(message.data));
      } catch (e) {
        continue;
      }

      const index = data.index;

      // 3. Validate Board Position
      if (state.board[index] !== 0) continue;

      // 4. Apply Move
      state.board[index] = mark;

      // 5. Check Win
      const wins = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
      ];
      for (const w of wins) {
        if (
          state.board[w[0]] !== 0 &&
          state.board[w[0]] === state.board[w[1]] &&
          state.board[w[1]] === state.board[w[2]]
        ) {
          state.winner = mark;
        }
      }

      // 6. Check Draw
      if (!state.winner && state.board.every((c) => c !== 0)) state.draw = true;

      // 7. Rotate Turn
      state.turn = state.turn === 1 ? 2 : 1;

      dispatcher.broadcastMessage(
        OP_CODE_STATE_UPDATE,
        JSON.stringify({
          board: state.board,
          turn: state.turn,
          winner: state.winner,
          draw: state.draw,
        })
      );
    }
  }
  return { state };
};

// Named Helpers
const matchTerminate = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: GameState,
  graceSeconds: number
) {
  return { state };
};
const matchSignal = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: GameState,
  data: string
) {
  return { state, data };
};
const matchLeave = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: GameState,
  presences: nkruntime.Presence[]
) {
  // If opponent leaves, remaining player wins automatically
  for (const presence of presences) {
    const leavingMark = state.marks[presence.userId];
    if (leavingMark) {
      state.winner = leavingMark === 1 ? 2 : 1; // The other mark wins
      state.draw = false;
      dispatcher.broadcastMessage(
        OP_CODE_STATE_UPDATE,
        JSON.stringify({
          board: state.board,
          turn: state.turn,
          winner: state.winner,
          draw: false,
        })
      );
    }
  }
  return { state };
};

// Matchmaker Handler: Creates a NEW match instance for every pair found
function matchmakerMatched(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  matches: nkruntime.MatchmakerResult[]
): string {
  return nk.matchCreate("tictactoe-standard", {});
}

// Entry Point
const InitModule: nkruntime.InitModule = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  logger.info("Typescript 1v1 TicTacToe module loaded.");

  initializer.registerMatch("tictactoe-standard", {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLoop,
    matchTerminate,
    matchSignal,
    matchLeave,
  });
  initializer.registerMatchmakerMatched(matchmakerMatched);
};

// @ts-ignore
!InitModule && InitModule.bind(null);
