import React, { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import {
    GameState,
    PaddleMovePayload,
    OpponentPaddleMovePayload,
    ScoreUpdatePayload,
    PlayerJoinedPayload,
    PlayerLeftPayload,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    PADDLE_WIDTH,
    PADDLE_HEIGHT,
    BALL_RADIUS,
} from '../shared/types';

const SERVER_URL = 'http://localhost:3001';

const Game: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [playerId, setPlayerId] = useState<string | null>(null);
    const [roomName, setRoomName] = useState<string | null>(null);
    const [isPlayerOne, setIsPlayerOne] = useState<boolean | undefined>(undefined);
    const [message, setMessage] = useState<string>('Connecting to server...');

    useEffect(() => {
        const newSocket = io(SERVER_URL);
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Connected to server with id:', newSocket.id);
            setPlayerId(newSocket.id!);
            setMessage('Waiting for another player...');
        });

        newSocket.on('gameState', (initialState: GameState) => {
            console.log('Received initial gameState:', initialState);
            setGameState(initialState);
            setRoomName(initialState.roomName);
            if (initialState.playerIds.length > 0 && newSocket.id) {
                setIsPlayerOne(initialState.playerIds[0] === newSocket.id);
            }
            if(initialState.playerIds.length === 2){
                setMessage(`Game started in room: ${initialState.roomName}. You are player ${initialState.playerIds[0] === newSocket.id ? 1 : 2}`);
            } else if (initialState.playerIds.length ===1 ){
                setMessage('Waiting for another player to join...');
            }
        });

        newSocket.on('playerJoined', (data: PlayerJoinedPayload) => {
            console.log('Player joined:', data);
            setMessage(`Player ${data.playerId === newSocket.id ? 'You' : data.playerId.substring(0,5) } joined room ${data.room}.`);
        });

        newSocket.on('opponentPaddleMove', (data: OpponentPaddleMovePayload) => {
            setGameState(prev => {
                if (!prev || !prev.players[data.playerId]) return prev;
                const updatedPlayers = {
                    ...prev.players,
                    [data.playerId]: { ...prev.players[data.playerId], paddleY: data.y }
                };
                return { ...prev, players: updatedPlayers };
            });
        });

        newSocket.on('scoreUpdate', (data: ScoreUpdatePayload) => {
            console.log('Score update:', data);
            setGameState(prev => {
                if (!prev) return prev;
                setMessage(`Player ${data.scorerId === prev.playerIds[0] ? '1 (Left)' : '2 (Right)'} scored!`);
                return { ...prev, scores: data.scores };
            });

            const timeoutId = setTimeout(() => {
                setGameState(currentGs => {
                    if (currentGs) {
                        const amIPlayerOneNow = playerId && currentGs.playerIds.length > 0 && currentGs.playerIds[0] === playerId;
                        if (currentGs.playerIds.length === 2) {
                            setMessage(`Game in progress. You are player ${amIPlayerOneNow ? 1 : 2}`);
                        } else {
                            setMessage('Waiting for another player...');
                        }
                    }
                    return currentGs;
                });
            }, 2000);
        });

        newSocket.on('playerLeft', (data: PlayerLeftPayload) => {
            console.log('Player left:', data);
            setMessage(`Player ${data.playerId.substring(0,5)} left. Waiting for a new player...`);
            setGameState(prev => {
                if (!prev) return prev;
                const newPlayers = { ...prev.players };
                delete newPlayers[data.playerId];
                const newPlayerIds = prev.playerIds.filter(id => id !== data.playerId);
                const newScores = { ...prev.scores };
                delete newScores[data.playerId];
                setIsPlayerOne(undefined);
                return {
                    ...prev,
                    players: newPlayers,
                    playerIds: newPlayerIds,
                    scores: newScores
                };
            });
        });

        return () => {
            newSocket.disconnect();
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !gameState || !socket || isPlayerOne === undefined) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        context.fillStyle = '#000';
        context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        context.fillStyle = '#FFF';
        Object.values(gameState.players).forEach((player, index) => {
            const isCurrentPlayerP1 = gameState.playerIds[0] === player.id;
            const paddleX = isCurrentPlayerP1 ? 0 : CANVAS_WIDTH - PADDLE_WIDTH;
            context.fillRect(paddleX, player.paddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
        });

        context.beginPath();
        context.arc(gameState.ball.x, gameState.ball.y, BALL_RADIUS, 0, Math.PI * 2);
        context.fillStyle = '#FFF';
        context.fill();
        context.closePath();

        context.font = '30px Arial';
        if (gameState.playerIds[0] && gameState.scores[gameState.playerIds[0]] !== undefined) {
            context.fillText(gameState.scores[gameState.playerIds[0]].toString(), CANVAS_WIDTH / 4, 50);
        }
        if (gameState.playerIds[1] && gameState.scores[gameState.playerIds[1]] !== undefined) {
            context.fillText(gameState.scores[gameState.playerIds[1]].toString(), (CANVAS_WIDTH / 4) * 3, 50);
        }

    }, [gameState, socket, isPlayerOne]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!socket || !gameState || isPlayerOne === undefined || !playerId) return;
            const currentPlayer = gameState.players[playerId];
            if (!currentPlayer) return;

            let newY = currentPlayer.paddleY;
            const speed = 20;

            if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
                newY -= speed;
            } else if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
                newY += speed;
            }

            if (newY < 0) newY = 0;
            if (newY + PADDLE_HEIGHT > CANVAS_HEIGHT) newY = CANVAS_HEIGHT - PADDLE_HEIGHT;

            if (newY !== currentPlayer.paddleY) {
                const payload: PaddleMovePayload = { y: newY };
                socket.emit('paddleMove', payload);
                setGameState(prev => {
                    if (!prev || !prev.players[playerId]) return prev;
                    const updatedPlayers = {
                        ...prev.players,
                        [playerId]: { ...prev.players[playerId], paddleY: newY }
                    };
                    return { ...prev, players: updatedPlayers };
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [socket, gameState, playerId, isPlayerOne]);

    const gameContainerStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Arial, sans-serif',
    };

    const canvasStyle: React.CSSProperties = {
        border: '2px solid #333',
        backgroundColor: '#000',
        boxShadow: '0 0 10px rgba(0,0,0,0.5)',
        margin: '20px'
    };

    const messageStyle: React.CSSProperties = {
        marginTop: '10px',
        fontSize: '1.2em',
        color: '#333'
    }

    return (
        <div style={gameContainerStyle}>
            <h1>Real-Time Pong</h1>
            <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                style={canvasStyle}
            />
            <div style={messageStyle}>{message}</div>
            {roomName && <div>Room: {roomName}</div>}
            {playerId && <div>Your ID: {playerId.substring(0,5)} ({isPlayerOne !== undefined ? (isPlayerOne ? 'Player 1 - Left' : 'Player 2 - Right') : 'Spectating'})</div>}
        </div>
    );
};

export default Game; 