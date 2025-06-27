window.addEventListener('DOMContentLoaded', () => {
    const socket = io("https://chi-li-tu-li.onrender.com");

    // --- DOM ELEMENTS ---
    const elements = {
        pieces: document.getElementById('pieces'),
        gridPoints: document.getElementById('grid-points'),
        endTurnBox: document.querySelector('.end-turn-box'),
        winBox: {
            element: document.getElementById('win-box'),
            text: document.querySelector('.win-box-text')
        },
        messageBox: {
            element: document.getElementById('message-box'),
            text: document.querySelector('.message-box-text')
        },
        turnIndicators: {
            top: document.getElementById('turn-indicator-top'),
            bottom: document.getElementById('turn-indicator-bottom')
        },
        initPanel: document.getElementById('online-init-panel'),
        roomTitle: document.getElementById('room-title'),
        createRoomBtn: document.getElementById('create-room-btn'),
        joinRoomBtn: document.getElementById('join-room-btn'),
        roomCodeInput: document.getElementById('room-code-input'),
        newGameBtn: document.getElementById('online-new-game-btn'),
        chatBox: document.getElementById('chat-box'),
        chatInput: document.getElementById('chat-input'),
        chatSendBtn: document.getElementById('chat-send-btn'),
        rematchPrompt: document.getElementById('rematch-prompt'),
        rematchAcceptBtn: document.getElementById('rematch-accept-btn'),
        rematchRejectBtn: document.getElementById('rematch-reject-btn'),
    };

    // --- GAME STATE ---
    const gameState = {
        selectedPiece: null,
        currentPlayer: null,
        gameOver: true,
        myColor: null,
        roomCode: null,
        hasCapturedThisTurn: false,
    };

    let board = Array.from({ length: 5 }, () => Array(5).fill(null));
    let messageTimer = null;
    let permanentMessageText = null;

    // --- 坐标翻译层 ---
    function translate(i, j) {
        if (gameState.myColor === 'white') {
            return [4 - i, 4 - j];
        }
        return [i, j];
    }

    // --- 游戏规则逻辑 ---
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
        const pieceColor = currentBoard[i][j];
        if (!pieceColor) return [];
        if (gameState.hasCapturedThisTurn) {
            const captureMoves = [];
            const opponentColor = pieceColor === 'black' ? 'white' : 'black';
            const directions = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
            for (const [di, dj] of directions) {
                const endI1 = i+di*2, endJ1 = j+dj*2, midI1 = i+di, midJ1 = j+dj;
                if (isValidPosition(endI1,endJ1) && currentBoard[endI1][endJ1] === null && isValidPosition(midI1,midJ1) && currentBoard[midI1][midJ1] === opponentColor && isMoveOnValidLine(i,j,endI1,endJ1)) {
                    captureMoves.push([endI1, endJ1]);
                }
                const endI3 = i+di*4, endJ3 = j+dj*4;
                if (isValidPosition(endI3,endJ3) && currentBoard[endI3][endJ3] === null && isValidPosition(i+di,j+dj) && currentBoard[i+di][j+dj] === opponentColor && isValidPosition(i+di*2,j+dj*2) && currentBoard[i+di*2][j+dj*2] === opponentColor && isValidPosition(i+di*3,j+dj*3) && currentBoard[i+di*3][j+dj*3] === opponentColor && isMoveOnValidLine(i,j,endI3,endJ3)) {
                    captureMoves.push([endI3, endJ3]);
                }
            }
            return captureMoves;
        }
        const allMoves = [];
        const opponentColor = pieceColor === 'black' ? 'white' : 'black';
        const directions = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
        for (const [di, dj] of directions) {
            const normalEndI = i + di, normalEndJ = j + dj;
            if (isValidPosition(normalEndI, normalEndJ) && currentBoard[normalEndI][normalEndJ] === null && isMoveOnValidLine(i, j, normalEndI, normalEndJ)) {
                allMoves.push([normalEndI, normalEndJ]);
            }
            const captureEndI1 = i+di*2, captureEndJ1 = j+dj*2, midI1 = i+di, midJ1 = j+dj;
            if (isValidPosition(captureEndI1,captureEndJ1) && currentBoard[captureEndI1][captureEndJ1] === null && isValidPosition(midI1,midJ1) && currentBoard[midI1][midJ1] === opponentColor && isMoveOnValidLine(i,j,captureEndI1,captureEndJ1)) {
                allMoves.push([captureEndI1, captureEndJ1]);
            }
            const captureEndI3 = i+di*4, captureEndJ3 = j+dj*4;
            if (isValidPosition(captureEndI3,captureEndJ3) && currentBoard[captureEndI3][captureEndJ3] === null && isValidPosition(i+di,j+dj) && currentBoard[i+di][j+dj] === opponentColor && isValidPosition(i+di*2,j+dj*2) && currentBoard[i+di*2][j+dj*2] === opponentColor && isValidPosition(i+di*3,j+dj*3) && currentBoard[i+di*3][j+dj*3] === opponentColor && isMoveOnValidLine(i,j,captureEndI3,captureEndJ3)) {
                allMoves.push([captureEndI3, captureEndJ3]);
            }
        }
        return allMoves;
    }
    function hasValidMovesForPlayer(playerColor, currentBoard) {
        for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) {
            if (currentBoard[i][j] === playerColor) if (getValidMoves(i, j, currentBoard).length > 0) return true;
        }}
        return false;
    }

    // --- UI, Rendering & Piece Manipulation ---
    function createGridPoints() {
        elements.gridPoints.innerHTML = '';
        for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) {
            const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            point.setAttribute("cx", j * 100); point.setAttribute("cy", i * 100);
            point.setAttribute("r", 15); point.setAttribute("class", "grid-point");
            point.setAttribute("data-i", i); point.setAttribute("data-j", j);
            elements.gridPoints.appendChild(point);
        }}
    }
    function createPiece(canonicalI, canonicalJ, color) {
        const [visualI, visualJ] = translate(canonicalI, canonicalJ);
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", visualJ * 100); circle.setAttribute("cy", visualI * 100);
        circle.setAttribute("r", 25); circle.setAttribute("fill", color);
        circle.setAttribute("data-i", visualI); circle.setAttribute("data-j", visualJ);
        circle.setAttribute("class", "piece");
        elements.pieces.appendChild(circle);
    }
    function getPieceAt(visualI, visualJ) {
        return document.querySelector(`#pieces circle[data-i="${visualI}"][data-j="${visualJ}"]`);
    }
    function resetSelection() {
        if (gameState.selectedPiece) {
            gameState.selectedPiece.classList.remove('selected');
            gameState.selectedPiece = null;
        }
        document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
    }
    function highlightPositions(canonicalMoves) {
        document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
        canonicalMoves.forEach(([canonicalI, canonicalJ]) => {
            const [visualI, visualJ] = translate(canonicalI, canonicalJ);
            const point = document.querySelector(`.grid-point[data-i="${visualI}"][data-j="${visualJ}"]`);
            if (point) point.classList.add('highlight');
        });
    }
    function movePiece(piece, canonicalTargetI, canonicalTargetJ) {
        const visualStartI = parseInt(piece.getAttribute('data-i'));
        const visualStartJ = parseInt(piece.getAttribute('data-j'));
        const [canonicalStartI, canonicalStartJ] = translate(visualStartI, visualStartJ);
        const pieceColor = board[canonicalStartI][canonicalStartJ];
        const opponentColor = pieceColor === 'black' ? 'white' : 'black';
        const step = Math.max(Math.abs(canonicalTargetI - canonicalStartI), Math.abs(canonicalTargetJ - canonicalStartJ));
        let captured = false;
        if (step > 1) {
            captured = true;
            const di = (canonicalTargetI - canonicalStartI) / step;
            const dj = (canonicalTargetJ - canonicalStartJ) / step;
            for (let k = 1; k < step; k++) {
                const canonicalMidI = canonicalStartI + di * k;
                const canonicalMidJ = canonicalStartJ + dj * k;
                if (board[canonicalMidI][canonicalMidJ] === opponentColor) {
                    const [visualMidI, visualMidJ] = translate(canonicalMidI, canonicalMidJ);
                    const capturedPiece = getPieceAt(visualMidI, visualMidJ);
                    if (capturedPiece) {
                        capturedPiece.setAttribute('fill', pieceColor);
                    }
                    board[canonicalMidI][canonicalMidJ] = pieceColor;
                }
            }
        }
        board[canonicalStartI][canonicalStartJ] = null;
        board[canonicalTargetI][canonicalTargetJ] = pieceColor;
        const [visualTargetI, visualTargetJ] = translate(canonicalTargetI, canonicalTargetJ);
        piece.setAttribute('data-i', visualTargetI);
        piece.setAttribute('data-j', visualTargetJ);
        piece.setAttribute('cx', visualTargetJ * 100);
        piece.setAttribute('cy', visualTargetI * 100);
        return captured;
    }
    function updateTurnIndicator() {
        if (gameState.gameOver || !gameState.myColor) {
            elements.turnIndicators.top.style.visibility = 'hidden';
            elements.turnIndicators.bottom.style.visibility = 'hidden'; return;
        }
        const opponentColor = gameState.myColor === 'black' ? 'white' : 'black';
        elements.turnIndicators.top.setAttribute('cx', -40); elements.turnIndicators.top.setAttribute('cy', -30);
        elements.turnIndicators.bottom.setAttribute('cx', -40); elements.turnIndicators.bottom.setAttribute('cy', 430);
        elements.turnIndicators.top.setAttribute('fill', opponentColor);
        elements.turnIndicators.bottom.setAttribute('fill', gameState.myColor);
        elements.turnIndicators.top.style.visibility = 'visible';
        elements.turnIndicators.bottom.style.visibility = 'visible';
        if (gameState.currentPlayer === gameState.myColor) {
            elements.turnIndicators.bottom.classList.add('selected');
            elements.turnIndicators.top.classList.remove('selected');
        } else {
            elements.turnIndicators.top.classList.add('selected');
            elements.turnIndicators.bottom.classList.remove('selected');
        }
    }
    function showEndTurnBox(visible) { elements.endTurnBox.style.visibility = (visible && gameState.hasCapturedThisTurn) ? 'visible' : 'hidden'; }
    function showBoardMessage(text, isPermanent = false) {
        if (isPermanent) {
            gameState.gameOver = true;
            permanentMessageText = text;
            if (messageTimer) clearTimeout(messageTimer);
            elements.messageBox.element.setAttribute('visibility', 'hidden');
            elements.winBox.text.textContent = text;
            elements.winBox.element.setAttribute('visibility', 'visible');
            updateTurnIndicator();
            showEndTurnBox(false);
        } else {
            if (elements.winBox.element.getAttribute('visibility') === 'visible') {
                elements.winBox.element.setAttribute('visibility', 'hidden');
            }
            if (messageTimer) clearTimeout(messageTimer);
            elements.messageBox.text.textContent = text;
            elements.messageBox.element.setAttribute('visibility', 'visible');
            messageTimer = setTimeout(() => {
                elements.messageBox.element.setAttribute('visibility', 'hidden');
                if (permanentMessageText) {
                    elements.winBox.text.textContent = permanentMessageText;
                    elements.winBox.element.setAttribute('visibility', 'visible');
                }
            }, 2500);
        }
    }

    // --- GAME FLOW & SETUP ---
    function setupGameBoard(playerColor, roomCode) {
        gameState.myColor = playerColor;
        gameState.roomCode = roomCode;
        gameState.gameOver = false;
        gameState.currentPlayer = 'black';
        gameState.hasCapturedThisTurn = false;
        permanentMessageText = null;
        if (messageTimer) clearTimeout(messageTimer);
        elements.winBox.element.setAttribute('visibility', 'hidden');
        elements.messageBox.element.setAttribute('visibility', 'hidden');
        elements.initPanel.style.display = 'none';
        elements.rematchPrompt.style.display = 'none';
        elements.chatBox.style.visibility = 'visible';
        elements.roomTitle.textContent = `${roomCode} 房间`;
        createGridPoints();
        createInitialPieces();
        updateTurnIndicator();
    }
    function createInitialPieces() {
        elements.pieces.innerHTML = '';
        board = Array.from({ length: 5 }, () => Array(5).fill(null));
        for(let i=0; i<2; i++) for(let j=0; j<5; j++) board[i][j] = 'white';
        for(let i=3; i<5; i++) for(let j=0; j<5; j++) board[i][j] = 'black';
        for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) {
            if (board[i][j]) createPiece(i, j, board[i][j]);
        }}
    }
    function resetLocalGame() { if (!gameState.myColor) return; setupGameBoard(gameState.myColor, gameState.roomCode); }
    
    // --- PLAYER ACTIONS (修改后) ---
    function handlePieceClick(e) {
        if (gameState.gameOver || gameState.currentPlayer !== gameState.myColor) return;
        const piece = e.target;
        if (piece.getAttribute('fill') !== gameState.myColor) return;
        if (gameState.selectedPiece === piece) { resetSelection(); return; }
        
        resetSelection();
        gameState.selectedPiece = piece;
        piece.classList.add('selected');
        const visualI = parseInt(piece.getAttribute('data-i'));
        const visualJ = parseInt(piece.getAttribute('data-j'));
        const [canonicalI, canonicalJ] = translate(visualI, visualJ);
        const moves = getValidMoves(canonicalI, canonicalJ, board);
        highlightPositions(moves);
    }
    function handleGridPointClick(e) {
        if (gameState.gameOver || !gameState.selectedPiece) return;
        const visualTargetI = parseInt(e.target.getAttribute('data-i'));
        const visualTargetJ = parseInt(e.target.getAttribute('data-j'));
        const [canonicalTargetI, canonicalTargetJ] = translate(visualTargetI, visualTargetJ);
        const visualStartI = parseInt(gameState.selectedPiece.getAttribute('data-i'));
        const visualStartJ = parseInt(gameState.selectedPiece.getAttribute('data-j'));
        const [canonicalStartI, canonicalStartJ] = translate(visualStartI, visualStartJ);
        
        const validMoves = getValidMoves(canonicalStartI, canonicalStartJ, board);
        if (!validMoves.some(m => m[0] === canonicalTargetI && m[1] === canonicalTargetJ)) {
            resetSelection(); return;
        }

        const moveData = { from: [canonicalStartI, canonicalStartJ], to: [canonicalTargetI, canonicalTargetJ] };
        socket.emit('move', { roomCode: gameState.roomCode, move: moveData });

        const captured = movePiece(gameState.selectedPiece, canonicalTargetI, canonicalTargetJ);
        resetSelection();

        // --- 修复开始：移动后立即请求服务器检查胜负 ---
        // 这样做可以确保即使是制胜的吃子，也能立即触发胜负判定
        socket.emit('checkGameState', { roomCode: gameState.roomCode, boardState: board });
        // --- 修复结束 ---

        if (captured) {
            gameState.hasCapturedThisTurn = true;
            showEndTurnBox(true);
            const moreCaptures = getValidMoves(canonicalTargetI, canonicalTargetJ, board);
            const canStillCapture = moreCaptures.some(m => Math.max(Math.abs(m[0]-canonicalTargetI), Math.abs(m[1]-canonicalTargetJ)) > 1);
            if (!canStillCapture) {
                // 如果不能再吃了，也让玩家手动结束，以防他们想悔棋或思考
            }
        } else {
            endMyTurn();
        }
    }
    function endMyTurn() {
        gameState.hasCapturedThisTurn = false;
        showEndTurnBox(false);
        socket.emit('endTurn', { roomCode: gameState.roomCode });
        // 在手动结束回合时，再次确认游戏状态
        socket.emit('checkGameState', { roomCode: gameState.roomCode, boardState: board });
        gameState.currentPlayer = gameState.currentPlayer === 'black' ? 'white' : 'black';
        updateTurnIndicator();
    }

    // --- SOCKET.IO EVENT LISTENERS ---
    socket.on('opponentDisconnected', () => { showBoardMessage("对方已断线", true); });
    socket.on('gameOver', (data) => {
        const { winner } = data;
        const message = (winner === gameState.myColor) ? "你赢了！" : "你输了！";
        showBoardMessage(message, true);
    });
    socket.on('chatMessage', (message) => { showBoardMessage(message, false); });
    socket.on('rematchResponse', (message) => { showBoardMessage(message, false); });
    socket.on('roomCreated', (roomCode) => {
        elements.initPanel.style.display = 'none';
        elements.roomTitle.textContent = `等待加入... 房间号: ${roomCode}`;
        gameState.roomCode = roomCode;
    });
    socket.on('startGame', (data) => { setupGameBoard(data.color, data.roomCode); });
    socket.on('opponentMoved', (move) => {
        const [canonicalFromI, canonicalFromJ] = move.from;
        const [visualFromI, visualFromJ] = translate(canonicalFromI, canonicalFromJ);
        const piece = getPieceAt(visualFromI, visualFromJ);
        if (piece) {
            movePiece(piece, move.to[0], move.to[1]);
        }
    });
    socket.on('opponentEndedTurn', () => {
        gameState.currentPlayer = gameState.currentPlayer === 'black' ? 'white' : 'black';
        updateTurnIndicator();
    });
    socket.on('rematchRequested', () => { elements.rematchPrompt.style.display = 'flex'; });
    socket.on('resetGame', () => { resetLocalGame(); });
    socket.on('error', (message) => { alert(message); });
    
    // --- PAGE EVENT LISTENERS (你的原始代码) ---
    elements.createRoomBtn.addEventListener('click', () => socket.emit('createRoom'));
    elements.joinRoomBtn.addEventListener('click', () => {
        const code = elements.roomCodeInput.value.trim().toUpperCase();
        if (code.length === 4) socket.emit('joinRoom', code); else alert('请输入有效的4位房间号。');
    });
    elements.pieces.addEventListener('click', handlePieceClick);
    elements.gridPoints.addEventListener('click', handleGridPointClick);
    elements.endTurnBox.addEventListener('click', endMyTurn);
    elements.chatSendBtn.addEventListener('click', () => {
        const message = elements.chatInput.value.trim();
        if (message) {
            socket.emit('chatMessage', { roomCode: gameState.roomCode, message: message });
            elements.chatInput.value = '';
        }
    });
    elements.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') elements.chatSendBtn.click(); });
    elements.newGameBtn.addEventListener('click', () => {
        if (gameState.roomCode) {
            socket.emit('requestRematch', gameState.roomCode);
            showBoardMessage('已发送重新开始请求...', false);
        }
    });
    elements.rematchAcceptBtn.addEventListener('click', () => {
        socket.emit('rematchResponse', { roomCode: gameState.roomCode, response: 'accepted' });
        elements.rematchPrompt.style.display = 'none';
    });
    elements.rematchRejectBtn.addEventListener('click', () => {
        socket.emit('rematchResponse', { roomCode: gameState.roomCode, response: 'rejected' });
        elements.rematchPrompt.style.display = 'none';
    });
});