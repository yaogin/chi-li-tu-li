window.addEventListener('DOMContentLoaded', () => {

    // --- 1. 全局配置和状态管理 ---
    const AI_CONFIG = {
        SEARCH_DEPTH: 3, TIME_LIMIT: 4000, THINKING_DELAY: 1200, CAPTURE_DELAY: 800,
        PIECE_WEIGHT: 100, MOBILITY_WEIGHT: 2, POSITION_WEIGHT: 1,
    };

    const elements = {
        piecesContainer: document.getElementById('pieces'),
        gridPointsContainer: document.getElementById('grid-points'),
        endTurnBox: document.querySelector('.end-turn-box'),
        winBox: { element: document.getElementById('win-box'), text: document.querySelector('.win-box-text') },
        turnIndicators: { top: document.getElementById('turn-indicator-top'), bottom: document.getElementById('turn-indicator-bottom') },
        initPanel: document.querySelector('.init-panel'),
        newGameBtn: document.getElementById('ai-new-game-btn'),
        aiFirstBtn: document.getElementById('ai-first'),
        humanFirstBtn: document.getElementById('human-first')
    };

    const gameState = {
        selectedPiece: null, currentPlayer: null, gameOver: true,
        humanColor: null, aiColor: null, hasCapturedThisTurn: false,
    };

    let board = [];
    let aiTimeout = null;
    
    // 视觉坐标系，上方为0,1行，下方为3,4行
    const visualPositions = {
        top: [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0],[1,1],[1,2],[1,3],[1,4]],
        bottom: [[3,0],[3,1],[3,2],[3,3],[3,4],[4,0],[4,1],[4,2],[4,3],[4,4]]
    };
    const boardLines = [
        [[0,0],[0,1],[0,2],[0,3],[0,4]],[[1,0],[1,1],[1,2],[1,3],[1,4]],[[2,0],[2,1],[2,2],[2,3],[2,4]],[[3,0],[3,1],[3,2],[3,3],[3,4]],[[4,0],[4,1],[4,2],[4,3],[4,4]],
        [[0,0],[1,0],[2,0],[3,0],[4,0]],[[0,1],[1,1],[2,1],[3,1],[4,1]],[[0,2],[1,2],[2,2],[3,2],[4,2]],[[0,3],[1,3],[2,3],[3,3],[4,3]],[[0,4],[1,4],[2,4],[3,4],[4,4]],
        [[0,0],[1,1],[2,2],[3,3],[4,4]],[[0,4],[1,3],[2,2],[3,1],[4,0]],
        [[0,2],[1,1],[2,0]],[[0,2],[1,3],[2,4]],[[2,0],[3,1],[4,2]],[[2,4],[3,3],[4,2]]
    ];
    const positionScores = [ [1,2,3,2,1], [2,4,6,4,2], [3,6,8,6,3], [2,4,6,4,2], [1,2,3,2,1] ];

    // --- 2. 基础工具和渲染函数 ---
    const isValidPosition = (i, j) => i >= 0 && i < 5 && j >= 0 && j < 5;
    function isMoveOnValidLine(startI, startJ, endI, endJ) {
        const step = Math.max(Math.abs(endI - startI), Math.abs(endJ - startJ));
        for (const line of boardLines) {
            const startIndex = line.findIndex(p => p[0] === startI && p[1] === startJ);
            const endIndex = line.findIndex(p => p[0] === endI && p[1] === endJ);
            if (startIndex > -1 && endIndex > -1 && Math.abs(startIndex - endIndex) === step) return true;
        }
        return false;
    }
    function createGridPoints() {
        elements.gridPointsContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
            const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            point.setAttribute("cx", j * 100); point.setAttribute("cy", i * 100);
            point.setAttribute("r", 15); point.setAttribute("class", "grid-point");
            point.setAttribute("data-i", i);
            point.setAttribute("data-j", j);
            elements.gridPointsContainer.appendChild(point);
        }
    }
    function createPiece(i, j, color) {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", j * 100);
        circle.setAttribute("cy", i * 100);
        circle.setAttribute("r", 25);
        circle.setAttribute("fill", color);
        circle.setAttribute("data-i", i);
        circle.setAttribute("data-j", j);
        circle.setAttribute("class", "piece");
        elements.piecesContainer.appendChild(circle);
    }
    function getPieceAt(i, j) {
        return elements.piecesContainer.querySelector(`circle[data-i="${i}"][data-j="${j}"]`);
    }
    function resetSelection() {
        if (gameState.selectedPiece) {
            gameState.selectedPiece.classList.remove('selected');
            gameState.selectedPiece = null;
        }
        document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
    }
    function highlightPositions(moves) {
        document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
        moves.forEach(move => {
            const [i, j] = move.to;
            const point = document.querySelector(`.grid-point[data-i="${i}"][data-j="${j}"]`);
            if (point) point.classList.add('highlight');
        });
    }
    function updateTurnIndicator() {
        if (gameState.gameOver || !gameState.humanColor) {
            elements.turnIndicators.top.style.visibility = 'hidden';
            elements.turnIndicators.bottom.style.visibility = 'hidden'; return;
        }
        const topColor = gameState.aiColor;
        const bottomColor = gameState.humanColor;
        elements.turnIndicators.top.setAttribute('fill', topColor);
        elements.turnIndicators.bottom.setAttribute('fill', bottomColor);
        elements.turnIndicators.top.setAttribute('cx', -40); elements.turnIndicators.top.setAttribute('cy', -30);
        elements.turnIndicators.bottom.setAttribute('cx', -40); elements.turnIndicators.bottom.setAttribute('cy', 430);
        elements.turnIndicators.top.style.visibility = 'visible';
        elements.turnIndicators.bottom.style.visibility = 'visible';
        if (gameState.currentPlayer === topColor) {
            elements.turnIndicators.top.classList.add('selected');
            elements.turnIndicators.bottom.classList.remove('selected');
        } else {
            elements.turnIndicators.bottom.classList.add('selected');
            elements.turnIndicators.top.classList.remove('selected');
        }
    }
    function showEndTurnBox(visible) {
        elements.endTurnBox.style.visibility = (visible && gameState.hasCapturedThisTurn) ? 'visible' : 'hidden';
    }
    function showWinBox(winnerColor) {
        gameState.gameOver = true;
        const message = (winnerColor === gameState.aiColor) ? "AI胜！" : "人类胜！";
        elements.winBox.text.textContent = message;
        elements.winBox.element.setAttribute('visibility', 'visible');
        showEndTurnBox(false);
    }

    // --- 3. 核心游戏逻辑 ---
    function getMovesForPiece(i, j, currentBoard, isContinuingCapture = false) {
        const pieceColor = currentBoard[i][j]; if (!pieceColor) return [];
        const opponentColor = (pieceColor === gameState.humanColor) ? gameState.aiColor : gameState.humanColor;
        const directions = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
        const captureMoves = [];
        const normalMoves = [];
        for (const [di, dj] of directions) {
            const endI1 = i + di * 2, endJ1 = j + dj * 2, midI1 = i + di, midJ1 = j + dj;
            if (isValidPosition(endI1, endJ1) && currentBoard[endI1][endJ1] === null && isValidPosition(midI1, midJ1) && currentBoard[midI1][midJ1] === opponentColor && isMoveOnValidLine(i, j, endI1, endJ1)) {
                captureMoves.push({ from: [i, j], to: [endI1, endJ1], isCapture: true });
            }
            const endI3 = i + di * 4, endJ3 = j + dj * 4;
            if (isValidPosition(endI3, endJ3) && currentBoard[endI3][endJ3] === null && isValidPosition(i+di,j+dj) && currentBoard[i+di][j+dj] === opponentColor && isValidPosition(i+di*2,j+dj*2) && currentBoard[i+di*2][j+dj*2] === opponentColor && isValidPosition(i+di*3,j+dj*3) && currentBoard[i+di*3][j+dj*3] === opponentColor && isMoveOnValidLine(i, j, endI3, endJ3)) {
                captureMoves.push({ from: [i, j], to: [endI3, endJ3], isCapture: true });
            }
        }
        if (isContinuingCapture) return captureMoves;
        for (const [di, dj] of directions) {
            const normalEndI = i + di, normalEndJ = j + dj;
            if (isValidPosition(normalEndI, normalEndJ) && currentBoard[normalEndI][normalEndJ] === null && isMoveOnValidLine(i, j, normalEndI, normalEndJ)) {
                normalMoves.push({ from: [i, j], to: [normalEndI, normalEndJ], isCapture: false });
            }
        }
        return normalMoves.concat(captureMoves);
    }
    function getAllMovesForPlayer(playerColor, currentBoard, inCaptureSequence = false) {
        let allMoves = [];
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
            if (currentBoard[i][j] === playerColor) {
                allMoves.push(...getMovesForPiece(i, j, currentBoard, inCaptureSequence));
            }
        }
        if (playerColor === gameState.aiColor) {
            const captureMoves = allMoves.filter(m => m.isCapture);
            if (captureMoves.length > 0) return captureMoves;
        }
        return inCaptureSequence ? allMoves.filter(m => m.isCapture) : allMoves;
    }
    function applyMove(move) {
        const piece = getPieceAt(move.from[0], move.from[1]);
        if (!piece) return false;
        const [fromI, fromJ] = move.from;
        const [toI, toJ] = move.to;
        const pieceColor = board[fromI][fromJ];
        if (move.isCapture) {
            const opponentColor = (pieceColor === gameState.humanColor) ? gameState.aiColor : gameState.humanColor;
            const step = Math.max(Math.abs(toI - fromI), Math.abs(toJ - fromJ));
            const di = (toI - fromI) / step, dj = (toJ - fromJ) / step;
            for (let k = 1; k < step; k++) {
                const midI = fromI + di * k, midJ = fromJ + dj * k;
                if (isValidPosition(midI, midJ) && board[midI][midJ] === opponentColor) {
                    const capturedPiece = getPieceAt(midI, midJ);
                    if (capturedPiece) capturedPiece.setAttribute('fill', pieceColor);
                    board[midI][midJ] = pieceColor;
                }
            }
        }
        board[fromI][fromJ] = null;
        board[toI][toJ] = pieceColor;
        piece.setAttribute('data-i', toI);
        piece.setAttribute('data-j', toJ);
        piece.setAttribute('cx', toJ * 100);
        piece.setAttribute('cy', toI * 100);
        return move.isCapture;
    }
    function checkWinCondition() {
        if (gameState.gameOver) return false;
        const humanMoves = getAllMovesForPlayer(gameState.humanColor, board).length > 0;
        const aiMoves = getAllMovesForPlayer(gameState.aiColor, board).length > 0;
        const humanPieces = board.flat().filter(p => p === gameState.humanColor).length;
        const aiPieces = board.flat().filter(p => p === gameState.aiColor).length;
        if (humanPieces === 0 || !humanMoves) {
            showWinBox(gameState.aiColor); return true;
        }
        if (aiPieces === 0 || !aiMoves) {
            showWinBox(gameState.humanColor); return true;
        }
        return false;
    }

    // --- 4. 事件处理器 ---
    function handlePieceClick(e) {
        if (gameState.gameOver || gameState.currentPlayer !== gameState.humanColor) return;
        const piece = e.target;
        if (!piece.classList.contains('piece') || piece.getAttribute('fill') !== gameState.humanColor) return;
        if (gameState.selectedPiece === piece) { resetSelection(); return; }
        resetSelection();
        gameState.selectedPiece = piece;
        piece.classList.add('selected');
        const i = parseInt(piece.getAttribute('data-i'));
        const j = parseInt(piece.getAttribute('data-j'));
        const moves = getAllMovesForPlayer(gameState.humanColor, board, gameState.hasCapturedThisTurn).filter(m => m.from[0] === i && m.from[1] === j);
        highlightPositions(moves);
    }
    function handleGridPointClick(e) {
        if (gameState.gameOver || !gameState.selectedPiece) return;
        const gridPoint = e.target;
        if (!gridPoint.classList.contains('grid-point')) return;
        const toI = parseInt(gridPoint.getAttribute('data-i'));
        const toJ = parseInt(gridPoint.getAttribute('data-j'));
        const fromI = parseInt(gameState.selectedPiece.getAttribute('data-i'));
        const fromJ = parseInt(gameState.selectedPiece.getAttribute('data-j'));
        const validMoves = getAllMovesForPlayer(gameState.humanColor, board, gameState.hasCapturedThisTurn).filter(m => m.from[0] === fromI && m.from[1] === fromJ);
        const aMove = validMoves.find(m => m.to[0] === toI && m.to[1] === toJ);
        if (!aMove) { resetSelection(); return; }
        const captured = applyMove(aMove);
        resetSelection();
        if (checkWinCondition()) return;
        if (captured) {
            gameState.hasCapturedThisTurn = true;
            showEndTurnBox(true);
        } else {
            endHumanTurn();
        }
    }
    function endHumanTurn() {
        resetSelection();
        gameState.hasCapturedThisTurn = false;
        showEndTurnBox(false);
        switchTurn();
    }

    // --- 5. 智能AI核心 ---
    function simulateMove(currentBoard, move) {
        const newBoard = JSON.parse(JSON.stringify(currentBoard));
        const [fromI, fromJ] = move.from;
        const [toI, toJ] = move.to;
        const pieceColor = newBoard[fromI][fromJ];
        if (move.isCapture) {
            const opponentColor = (pieceColor === gameState.humanColor) ? gameState.aiColor : gameState.humanColor;
            const step = Math.max(Math.abs(toI - fromI), Math.abs(toJ - fromJ));
            const di = (toI - fromI) / step, dj = (toJ - fromJ) / step;
            for (let k = 1; k < step; k++) { newBoard[fromI + di * k][fromJ + dj * k] = pieceColor; }
        }
        newBoard[toI][toJ] = pieceColor;
        newBoard[fromI][fromJ] = null;
        return newBoard;
    }
    function evaluateBoard(currentBoard) {
        let score = 0;
        let aiPieces = 0, humanPieces = 0;
        let aiMoves = 0, humanMoves = 0;
        let aiPositionScore = 0, humanPositionScore = 0;
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
            if (currentBoard[i][j] === gameState.aiColor) {
                aiPieces++;
                aiPositionScore += positionScores[i][j];
            } else if (currentBoard[i][j] === gameState.humanColor) {
                humanPieces++;
                humanPositionScore += positionScores[i][j];
            }
        }
        aiMoves = getAllMovesForPlayer(gameState.aiColor, currentBoard).length;
        humanMoves = getAllMovesForPlayer(gameState.humanColor, currentBoard).length;
        if (humanPieces === 0 || humanMoves === 0) return Infinity;
        if (aiPieces === 0 || aiMoves === 0) return -Infinity;
        score += (aiPieces - humanPieces) * AI_CONFIG.PIECE_WEIGHT;
        score += (aiMoves - humanMoves) * AI_CONFIG.MOBILITY_WEIGHT;
        score += (aiPositionScore - humanPositionScore) * AI_CONFIG.POSITION_WEIGHT;
        return score;
    }
    function minimax(currentBoard, depth, alpha, beta, isMaximizingPlayer) {
        if (depth === 0) return { score: evaluateBoard(currentBoard) };
        const playerColor = isMaximizingPlayer ? gameState.aiColor : gameState.humanColor;
        const availableMoves = getAllMovesForPlayer(playerColor, currentBoard);
        if (availableMoves.length === 0) return { score: evaluateBoard(currentBoard) };
        let bestMove = availableMoves[0];
        if (isMaximizingPlayer) {
            let maxEval = -Infinity;
            for (const move of availableMoves) {
                let node = simulateMove(currentBoard, move);
                let evaluationResult = minimax(node, depth - 1, alpha, beta, false);
                if (evaluationResult.score > maxEval) { maxEval = evaluationResult.score; bestMove = move; }
                alpha = Math.max(alpha, evaluationResult.score);
                if (beta <= alpha) break;
            }
            return { score: maxEval, move: bestMove };
        } else {
            let minEval = Infinity;
            for (const move of availableMoves) {
                let node = simulateMove(currentBoard, move);
                let evaluationResult = minimax(node, depth - 1, alpha, beta, true);
                if (evaluationResult.score < minEval) { minEval = evaluationResult.score; bestMove = move; }
                beta = Math.min(beta, evaluationResult.score);
                if (beta <= alpha) break;
            }
            return { score: minEval, move: bestMove };
        }
    }
    function aiTurn() {
        if (gameState.gameOver) return;
        let bestMove = null;
        let thinking = true;
        aiTimeout = setTimeout(() => {
            thinking = false;
            console.warn("AI思考超时，将选择一个随机合法移动。");
            const allMoves = getAllMovesForPlayer(gameState.aiColor, board);
            if (allMoves.length > 0) {
                bestMove = allMoves[Math.floor(Math.random() * allMoves.length)];
                finalizeAiMove(bestMove);
            } else {
                switchTurn();
            }
        }, AI_CONFIG.TIME_LIMIT);
        
        setTimeout(() => {
            if (!thinking) return;
            const result = minimax(board, AI_CONFIG.SEARCH_DEPTH, -Infinity, Infinity, true);
            clearTimeout(aiTimeout);
            finalizeAiMove(result.move);
        }, 30);
    }
    function finalizeAiMove(move) {
        setTimeout(() => {
            if (move) {
                const captured = applyMove(move);
                if (checkWinCondition()) return;
                if (captured) {
                    const moreCaptures = getAllMovesForPlayer(gameState.aiColor, board, true);
                    if (moreCaptures.length > 0) {
                        aiTurn(); return;
                    }
                }
            }
            switchTurn();
        }, move && move.isCapture ? AI_CONFIG.CAPTURE_DELAY : AI_CONFIG.THINKING_DELAY);
    }

    // --- 6. 游戏流程控制 ---
    function switchTurn() {
        if (gameState.gameOver) return;
        gameState.currentPlayer = gameState.currentPlayer === gameState.humanColor ? gameState.aiColor : gameState.humanColor;
        updateTurnIndicator();
        if (gameState.currentPlayer === gameState.aiColor) {
            aiTurn();
        }
    }
    function createInitialPieces() {
        elements.piecesContainer.innerHTML = '';
        board = Array.from({ length: 5 }, () => Array(5).fill(null));

        const humanPositions = visualPositions.bottom;
        const aiPositions = visualPositions.top;

        humanPositions.forEach(([i, j]) => {
            createPiece(i, j, gameState.humanColor);
            board[i][j] = gameState.humanColor;
        });
        aiPositions.forEach(([i, j]) => {
            createPiece(i, j, gameState.aiColor);
            board[i][j] = gameState.aiColor;
        });
    }
    function initGame(firstPlayer) {
        elements.initPanel.style.display = 'none';
        gameState.gameOver = false;
        gameState.selectedPiece = null;
        gameState.hasCapturedThisTurn = false;
        
        if (firstPlayer === 'human') {
            gameState.humanColor = 'black';
            gameState.aiColor = 'white';
        } else {
            gameState.humanColor = 'white';
            gameState.aiColor = 'black';
        }
        
        // 黑方永远先行
        gameState.currentPlayer = 'black';
        
        createGridPoints();
        createInitialPieces();
        updateTurnIndicator();
        
        if (gameState.currentPlayer === gameState.aiColor) {
            setTimeout(aiTurn, AI_CONFIG.THINKING_DELAY);
        }
    }
    function resetGame() {
        gameState.gameOver = true;
        elements.initPanel.style.display = 'flex';
        elements.winBox.element.setAttribute('visibility', 'hidden');
        elements.piecesContainer.innerHTML = '';
        elements.gridPointsContainer.innerHTML = '';
        board = Array.from({ length: 5 }, () => Array(5).fill(null));
        resetSelection();
        showEndTurnBox(false);
        updateTurnIndicator();
    }

    // --- 7. 初始化和事件绑定 ---
    elements.newGameBtn.addEventListener('click', resetGame);
    elements.endTurnBox.addEventListener('click', endHumanTurn);
    elements.aiFirstBtn.addEventListener('click', () => initGame('ai'));
    elements.humanFirstBtn.addEventListener('click', () => initGame('human'));
    
    document.querySelector('.board-anchor').addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('piece')) {
            handlePieceClick(e);
        } else if (target.classList.contains('grid-point')) {
            handleGridPointClick(e);
        }
    });

    window.addEventListener('resize', () => {
        const anchor = document.querySelector('.board-anchor');
        const size = Math.min(window.innerWidth - 20, 500);
        anchor.style.width = `${size}px`;
        anchor.style.height = `${size}px`;
    });
    
    resetGame();
});