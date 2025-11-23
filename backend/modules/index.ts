interface GameState {
  board: number[];
  marks: { [userId: string]: number };
  usernames: { [userId: string]: string };
  players: string[];
  activePlayerIndex: number;
  winner: number | null;
  draw: boolean;
  deadline: number;
}

const OP_CODE_MOVE = 1;
const OP_CODE_STATE_UPDATE = 2;

function parseMessage(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  data: any
): any {
  try {
    if (typeof data === "string") return JSON.parse(data);
    const jsonString = nk.binaryToString(data);
    return JSON.parse(jsonString);
  } catch (error) {
    logger.error(`Parse Error: ${error}`);
    return null;
  }
}

const matchInit = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: { [key: string]: any }
) {
  logger.info("Match Initialized");
  const state: GameState = {
    board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    marks: {},
    usernames: {},
    players: [],
    activePlayerIndex: 0,
    winner: null,
    draw: false,
    deadline: 0,
  };
  return { state, tickRate: 1, label: "tictactoe-v4" };
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
  if (state.players.length >= 2)
    return { state, accept: false, rejectMessage: "Match full" };
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
    if (state.players.indexOf(presence.userId) !== -1) continue;
    state.players.push(presence.userId);
    state.marks[presence.userId] = state.players.length; 
    state.usernames[presence.userId] = presence.username;
    logger.info(
      `Player Joined: ${presence.username} (${presence.userId}) -> Mark ${
        state.marks[presence.userId]
      }`
    );
  }

  if (state.players.length === 2) {
    state.deadline = Date.now() + 30000;
    state.activePlayerIndex = 0;

    logger.info(
      `Match Started. Player 1: ${state.players[0]}, Player 2: ${state.players[1]}`
    );

    dispatcher.broadcastMessage(
      OP_CODE_STATE_UPDATE,
      JSON.stringify({
        board: state.board,
        activePlayerId: state.players[0],
        usernames: state.usernames,
        marks: state.marks, 
        deadline: state.deadline,
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
  if (state.winner || state.draw) return { state };

  for (const message of messages) {
    if (message.opCode === OP_CODE_MOVE) {
      const senderId = message.sender.userId;
      const currentActiveId = state.players[state.activePlayerIndex];

     
      if (senderId !== currentActiveId) {
        logger.warn(
          `REJECTED: Sender ${senderId} is not active player ${currentActiveId}`
        );
        dispatcher.broadcastMessage(
          OP_CODE_STATE_UPDATE,
          JSON.stringify({
            board: state.board,
            activePlayerId: currentActiveId,
            usernames: state.usernames,
            marks: state.marks,
            deadline: state.deadline,
          })
        );
        continue;
      }
      const data = parseMessage(nk, logger, message.data);
      if (!data || typeof data.index !== "number") continue;
      const index = data.index;
      if (state.board[index] !== 0) continue;
      const mark = state.marks[senderId];
      state.board[index] = mark;
      logger.info(`ACCEPTED: Mark ${mark} at ${index}`);
      let won = false;
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
          won = true;
        }
      }

      if (!won && state.board.every((c) => c !== 0)) state.draw = true;
      if (!state.winner && !state.draw) {
        state.activePlayerIndex = state.activePlayerIndex === 0 ? 1 : 0;
        state.deadline = Date.now() + 30000;
      }

      dispatcher.broadcastMessage(
        OP_CODE_STATE_UPDATE,
        JSON.stringify({
          board: state.board,
          activePlayerId: state.players[state.activePlayerIndex],
          winner: state.winner,
          draw: state.draw,
          usernames: state.usernames,
          marks: state.marks,
          deadline: state.deadline,
        })
      );
    }
  }
  return { state };
};

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
  for (const presence of presences) {
    const leavingMark = state.marks[presence.userId];
    if (leavingMark) {
      state.winner = leavingMark === 1 ? 2 : 1;
      state.draw = false;
      dispatcher.broadcastMessage(
        OP_CODE_STATE_UPDATE,
        JSON.stringify({
          board: state.board,
          winner: state.winner,
          draw: false,
          usernames: state.usernames,
        })
      );
      return null;
    }
  }
  return { state };
};

function matchmakerMatched(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  matches: nkruntime.MatchmakerResult[]
): string {
  return nk.matchCreate("tictactoe-v4", {});
}

const InitModule: nkruntime.InitModule = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  logger.info("Typescript Bulletproof TicTacToe V4 loaded.");
  initializer.registerMatch("tictactoe-v4", {
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
