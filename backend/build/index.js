"use strict";
var OP_CODE_MOVE = 1;
var OP_CODE_STATE_UPDATE = 2;
// --- HANDLERS ---
var matchInit = function (ctx, logger, nk, params) {
    var state = {
        board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        marks: {},
        players: [],
        turn: 1,
        winner: null,
        draw: false,
    };
    return { state: state, tickRate: 1, label: "tictactoe-standard" };
};
var matchJoinAttempt = function (ctx, logger, nk, dispatcher, tick, state, presence) {
    // STRICT 1v1: Allow max 2 players per match instance
    if (state.players.length >= 2) {
        return { state: state, accept: false, rejectMessage: "Match full" };
    }
    return { state: state, accept: true };
};
var matchJoin = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    for (var _i = 0, presences_1 = presences; _i < presences_1.length; _i++) {
        var presence = presences_1[_i];
        state.players.push(presence.userId);
        // First player = 1 (X), Second player = 2 (O)
        state.marks[presence.userId] = state.players.length;
    }
    // Broadcast start ONLY when we have 2 players
    if (state.players.length === 2) {
        dispatcher.broadcastMessage(OP_CODE_STATE_UPDATE, JSON.stringify({
            board: state.board,
            turn: state.turn,
            status: "playing",
        }));
    }
    return { state: state };
};
var matchLoop = function (ctx, logger, nk, dispatcher, tick, state, messages) {
    if (state.winner || state.draw)
        return null;
    for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
        var message = messages_1[_i];
        if (message.opCode === OP_CODE_MOVE) {
            var senderId = message.sender.userId;
            var mark = state.marks[senderId];
            // 1. Validate Turn
            if (mark !== state.turn)
                continue;
            // 2. Parse Move
            var data = void 0;
            try {
                data = JSON.parse(nk.binaryToString(message.data));
            }
            catch (e) {
                continue;
            }
            var index = data.index;
            // 3. Validate Board Position
            if (state.board[index] !== 0)
                continue;
            // 4. Apply Move
            state.board[index] = mark;
            // 5. Check Win
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
                }
            }
            // 6. Check Draw
            if (!state.winner && state.board.every(function (c) { return c !== 0; }))
                state.draw = true;
            // 7. Rotate Turn
            state.turn = state.turn === 1 ? 2 : 1;
            dispatcher.broadcastMessage(OP_CODE_STATE_UPDATE, JSON.stringify({
                board: state.board,
                turn: state.turn,
                winner: state.winner,
                draw: state.draw,
            }));
        }
    }
    return { state: state };
};
// Named Helpers
var matchTerminate = function (ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    return { state: state };
};
var matchSignal = function (ctx, logger, nk, dispatcher, tick, state, data) {
    return { state: state, data: data };
};
var matchLeave = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    // If opponent leaves, remaining player wins automatically
    for (var _i = 0, presences_2 = presences; _i < presences_2.length; _i++) {
        var presence = presences_2[_i];
        var leavingMark = state.marks[presence.userId];
        if (leavingMark) {
            state.winner = leavingMark === 1 ? 2 : 1; // The other mark wins
            state.draw = false;
            dispatcher.broadcastMessage(OP_CODE_STATE_UPDATE, JSON.stringify({
                board: state.board,
                turn: state.turn,
                winner: state.winner,
                draw: false,
            }));
        }
    }
    return { state: state };
};
// Matchmaker Handler: Creates a NEW match instance for every pair found
function matchmakerMatched(ctx, logger, nk, matches) {
    return nk.matchCreate("tictactoe-standard", {});
}
// Entry Point
var InitModule = function (ctx, logger, nk, initializer) {
    logger.info("Typescript 1v1 TicTacToe module loaded.");
    initializer.registerMatch("tictactoe-standard", {
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
