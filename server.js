const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const rooms = {};

// --- 静态文件和路由设置 ---
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/ai_vs_ai.html', (req, res) => { res.sendFile(path.join(__dirname, 'ai_vs_ai.html')); });
app.get('/online_game.html', (req, res) => { res.sendFile(path.join(__dirname, 'online_game.html')); });

// --- 服务器端工具函数 ---
function generateRoomCode() {
    let code;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms[code]);
    return code;
}

// --- 服务器端的胜负判定逻辑 ---
const boardLines = [
    [[0,0],[0,1],[0,2],[0,3],[0,4]],[[1,0],[1,1],[1,2],[1,3],[1,4]],[[2,0],[2,1],[2,2],[2,3],[2,4]],[[3,0],[3,1],[3,2],[3,3],[3,4]],[[4,0],[4,1],[4,2],[4,3],[4,4]],
    [[0,0],[1,0],[2,0],[3,0],[4,0]],[[0,1],[1,1],[2,1],[3,1],[4,1]],[[0,2],[1,2],[2,2],[3,2],[4,2]],[[0,3],[1,3],[2,3],[3,3],[4,3]],[[0,4],[1,4],[2,4],[3,4],[4,4]],
    [[0,0],[1,1],[2,2],[3,3],[4,4]],[[0,4],[1,3],[2,2],[3,1],[4,0]],
    [[0,2],[1,1],[2,0]],[[0,2],[1,3],[2,4]],[[2,0],[3,1],[4,2]],[[2,4],[3,3],[4,2]]
];
function isValidPosition(i, j) { return i >= 0 && i < 5 && j >= 0 && j < 5; }
function isMoveOnValidLine(startI, startJ, endI, endJ) {
    for (const line of boardLines) {
        let startFound = false, endFound = false;
        for(const point of line) {
            if(point[0] === startI && point[1] === startJ) startFound = true;
            if(point[0] === endI && point[1] === endJ) endFound = true;
        }
        if (startFound && endFound) {
            const startIndex = line.findIndex(p => p[0] === startI && p[1] === startJ);
            const endIndex = line.findIndex(p => p[0] === endI && p[1] === endJ);
            const step = Math.max(Math.abs(endI - startI), Math.abs(endJ - startJ));
            if (Math.abs(startIndex - endIndex) === step) return true;
        }
    }
    return false;
}
function getValidMoves(i, j, currentBoard) {
    const pieceColor = currentBoard[i][j]; if (!pieceColor) return [];
    const allMoves = [];
    const opponentColor = pieceColor === 'black' ? 'white' : 'black';
    const directions = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
    for (const [di, dj] of directions) {
        // --- 修复开始：将损坏的行替换为正确的语法 ---
        const nI=i+di, nJ=j+dj; 
        if (isValidPosition(nI,nJ) && currentBoard[nI][nJ]===null && isMoveOnValidLine(i,j,nI,nJ)) {
            allMoves.push([nI,nJ]);
        }
        const cI1=i+di*2,cJ1=j+dj*2,mI1=i+di,mJ1=j+dj; 
        if(isValidPosition(cI1,cJ1) && currentBoard[cI1][cJ1]===null && isValidPosition(mI1,mJ1) && currentBoard[mI1][mJ1]===opponentColor && isMoveOnValidLine(i,j,cI1,cJ1)) {
            allMoves.push([cI1,cJ1]);
        }
        const cI3=i+di*4,cJ3=j+dj*4; 
        if(isValidPosition(cI3,cJ3) && currentBoard[cI3][cJ3]===null && isValidPosition(i+di,j+dj) && currentBoard[i+di][j+dj]===opponentColor && isValidPosition(i+di*2,j+dj*2) && currentBoard[i+di*2][j+dj*2]===opponentColor && isValidPosition(i+di*3,j+dj*3) && currentBoard[i+di*3][j+dj*3]===opponentColor && isMoveOnValidLine(i,j,cI3,cJ3)) {
            allMoves.push([cI3,cJ3]);
        }
        // --- 修复结束 ---
    }
    return allMoves;
}
function hasValidMovesForPlayer(playerColor, currentBoard) {
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        if (currentBoard[i][j] === playerColor) {
            if (getValidMoves(i, j, currentBoard).length > 0) return true;
        }
    }
    return false;
}

// --- Socket.IO 连接和事件处理 ---
io.on('connection', (socket) => {
    console.log('一个用户已连接:', socket.id);

    socket.on('createRoom', () => {
        const roomCode = generateRoomCode();
        socket.join(roomCode);
        rooms[roomCode] = {
            players: { [socket.id]: 'black' },
            sockets: [socket.id]
        };
        socket.emit('roomCreated', roomCode);
        console.log(`房间 ${roomCode} 已被 ${socket.id} 创建`);
    });
    socket.on('joinRoom', (roomCode) => {
        roomCode = roomCode.toUpperCase();
        const room = rooms[roomCode];
        if (!room) { socket.emit('error', '房间未找到。'); return; }
        if (room.sockets.includes(socket.id)) { return; }
        if (room.sockets.length >= 2) { socket.emit('error', '房间已满。'); return; }
        socket.join(roomCode);
        room.players[socket.id] = 'white';
        room.sockets.push(socket.id);
        console.log(`${socket.id} 已加入房间 ${roomCode}`);
        if (room.sockets.length === 2) {
            const creatorSocketId = room.sockets[0];
            const joinerSocketId = room.sockets[1];
            io.to(creatorSocketId).emit('startGame', { color: 'black', roomCode });
            io.to(joinerSocketId).emit('startGame', { color: 'white', roomCode });
        }
    });
    socket.on('move', (data) => {
        socket.to(data.roomCode).emit('opponentMoved', data.move);
    });
    socket.on('endTurn', (data) => {
        socket.to(data.roomCode).emit('opponentEndedTurn');
    });
    socket.on('checkGameState', (data) => {
        const { roomCode, boardState } = data;
        const room = rooms[roomCode];
        if (!room) return;
        const blackPieces = boardState.flat().filter(p => p === 'black').length;
        const whitePieces = boardState.flat().filter(p => p === 'white').length;
        const blackHasMoves = hasValidMovesForPlayer('black', boardState);
        const whiteHasMoves = hasValidMovesForPlayer('white', boardState);
        let winner = null;
        if (whitePieces === 0 || !whiteHasMoves) {
            winner = 'black';
        } else if (blackPieces === 0 || !blackHasMoves) {
            winner = 'white';
        }
        if (winner) {
            io.in(roomCode).emit('gameOver', { winner: winner });
        }
    });
    socket.on('chatMessage', (data) => {
        socket.to(data.roomCode).emit('chatMessage', `对方: ${data.message}`);
        socket.emit('chatMessage', `我: ${data.message}`);
    });
    socket.on('requestRematch', (roomCode) => {
        socket.to(roomCode).emit('rematchRequested');
    });
    socket.on('rematchResponse', (data) => {
        if (data.response === 'accepted') {
            socket.to(data.roomCode).emit('rematchResponse', '对方已同意');
            io.in(data.roomCode).emit('resetGame');
        } else {
             socket.to(data.roomCode).emit('rematchResponse', '对方已拒绝');
        }
    });
    socket.on('disconnect', () => {
        console.log('一个用户已断开连接:', socket.id);
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const playerIndex = room.sockets.indexOf(socket.id);
            if (playerIndex > -1) {
                room.sockets.splice(playerIndex, 1);
                delete room.players[socket.id];
                console.log(`玩家 ${socket.id} 已从房间 ${roomCode} 移除。`);
                if (room.sockets.length > 0) {
                    socket.to(roomCode).emit('opponentDisconnected');
                }
                if (room.sockets.length === 0) {
                    delete rooms[roomCode];
                    console.log(`房间 ${roomCode} 已空，已被关闭。`);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`服务器正在监听端口 ${PORT}`));