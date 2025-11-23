"use strict";
var OP_CODE_MOVE = 1;
var OP_CODE_STATE_UPDATE = 2;
// --- PARSER ---
function parseMessage(nk, logger, data) {
    try {
        if (typeof data === "string")
            return JSON.parse(data);
        var jsonString = nk.binaryToString(data);
        return JSON.parse(jsonString);
    }
    catch (error) {
        logger.error("Parse Error: ".concat(error));
        return null;
    }
}
// --- INIT ---
var matchInit = function (ctx, logger, nk, params) {
    logger.info("Match Initialized");
    var state = {
        board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        marks: {},
        usernames: {},
        players: [],
        activePlayerIndex: 0,
        winner: null,
        draw: false,
        deadline: 0,
    };
    return { state: state, tickRate: 1, label: "tictactoe-v4" };
};
// --- JOIN ---
var matchJoinAttempt = function (ctx, logger, nk, dispatcher, tick, state, presence) {
    if (state.players.length >= 2)
        return { state: state, accept: false, rejectMessage: "Match full" };
    return { state: state, accept: true };
};
var matchJoin = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    for (var _i = 0, presences_1 = presences; _i < presences_1.length; _i++) {
        var presence = presences_1[_i];
        if (state.players.indexOf(presence.userId) !== -1)
            continue;
        state.players.push(presence.userId);
        state.marks[presence.userId] = state.players.length; // 1 or 2
        state.usernames[presence.userId] = presence.username;
        logger.info("Player Joined: ".concat(presence.username, " (").concat(presence.userId, ") -> Mark ").concat(state.marks[presence.userId]));
    }
    if (state.players.length === 2) {
        state.deadline = Date.now() + 30000;
        state.activePlayerIndex = 0;
        logger.info("Match Started. Player 1: ".concat(state.players[0], ", Player 2: ").concat(state.players[1]));
        dispatcher.broadcastMessage(OP_CODE_STATE_UPDATE, JSON.stringify({
            board: state.board,
            activePlayerId: state.players[0],
            usernames: state.usernames,
            marks: state.marks,
            deadline: state.deadline,
            status: "playing",
        }));
    }
    return { state: state };
};
// --- GAME LOOP ---
var matchLoop = function (ctx, logger, nk, dispatcher, tick, state, messages) {
    if (state.winner || state.draw)
        return { state: state };
    for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
        var message = messages_1[_i];
        if (message.opCode === OP_CODE_MOVE) {
            var senderId = message.sender.userId;
            var currentActiveId = state.players[state.activePlayerIndex];
            // 1. Turn Check
            if (senderId !== currentActiveId) {
                logger.warn("REJECTED: Sender ".concat(senderId, " is not active player ").concat(currentActiveId));
                // Force sync to fix client state
                dispatcher.broadcastMessage(OP_CODE_STATE_UPDATE, JSON.stringify({
                    board: state.board,
                    activePlayerId: currentActiveId,
                    usernames: state.usernames,
                    marks: state.marks,
                    deadline: state.deadline,
                }));
                continue;
            }
            // 2. Parse
            var data = parseMessage(nk, logger, message.data);
            if (!data || typeof data.index !== "number")
                continue;
            var index = data.index;
            // 3. Validate
            if (state.board[index] !== 0)
                continue;
            // 4. Apply
            var mark = state.marks[senderId];
            state.board[index] = mark;
            logger.info("ACCEPTED: Mark ".concat(mark, " at ").concat(index));
            // 5. Win Check
            var won = false;
            var wins = [
                [0, 1, 2],
                [3, 4, 5],
                [6, 7, 8],
                [0, 3, 6],
                [1, 4, 7],
                [2, 5, 8],
                [0, 4, 8],
                [2, 4, 6],
            ];
            for (var _a = 0, wins_1 = wins; _a < wins_1.length; _a++) {
                var w = wins_1[_a];
                if (state.board[w[0]] !== 0 &&
                    state.board[w[0]] === state.board[w[1]] &&
                    state.board[w[1]] === state.board[w[2]]) {
                    state.winner = mark;
                    won = true;
                }
            }
            if (!won && state.board.every(function (c) { return c !== 0; }))
                state.draw = true;
            // 6. Next Turn or End
            if (!state.winner && !state.draw) {
                state.activePlayerIndex = state.activePlayerIndex === 0 ? 1 : 0;
                state.deadline = Date.now() + 30000;
            }
            dispatcher.broadcastMessage(OP_CODE_STATE_UPDATE, JSON.stringify({
                board: state.board,
                activePlayerId: state.players[state.activePlayerIndex],
                winner: state.winner,
                draw: state.draw,
                usernames: state.usernames,
                marks: state.marks,
                deadline: state.deadline,
            }));
        }
    }
    return { state: state };
};
var matchTerminate = function (ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    return { state: state };
};
var matchSignal = function (ctx, logger, nk, dispatcher, tick, state, data) {
    return { state: state, data: data };
};
var matchLeave = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    // Auto-Win
    for (var _i = 0, presences_2 = presences; _i < presences_2.length; _i++) {
        var presence = presences_2[_i];
        var leavingMark = state.marks[presence.userId];
        if (leavingMark) {
            state.winner = leavingMark === 1 ? 2 : 1;
            state.draw = false;
            dispatcher.broadcastMessage(OP_CODE_STATE_UPDATE, JSON.stringify({
                board: state.board,
                winner: state.winner,
                draw: false,
                usernames: state.usernames,
            }));
            return null;
        }
    }
    return { state: state };
};
function matchmakerMatched(ctx, logger, nk, matches) {
    return nk.matchCreate("tictactoe-v4", {});
}
var InitModule = function (ctx, logger, nk, initializer) {
    logger.info("Typescript Bulletproof TicTacToe V4 loaded.");
    initializer.registerMatch("tictactoe-v4", {
        matchInit: matchInit,
        matchJoinAttempt: matchJoinAttempt,
        matchJoin: matchJoin,
        matchLoop: matchLoop,
        matchTerminate: matchTerminate,
        matchSignal: matchSignal,
        matchLeave: matchLeave,
    });
    initializer.registerMatchmakerMatched(matchmakerMatched);
};
// @ts-ignore
!InitModule && InitModule.bind(null);
