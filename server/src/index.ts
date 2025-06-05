import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import {
    Player, Ball, GameState, PaddleMovePayload,
    CANVAS_HEIGHT, CANVAS_WIDTH, PADDLE_HEIGHT, BALL_RADIUS, PADDLE_WIDTH
} from './shared/types';

const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
}));

const io = new SocketIOServer(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

const gameRooms = new Map<string, GameState>();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    let currentRoom: string | null = null;

    let foundRoom = false;
    for (const [roomName, state] of gameRooms.entries()) {
        if (state.playerIds.length < 2) {
            currentRoom = roomName;
            state.playerIds.push(socket.id);
            state.players[socket.id] = {
                id: socket.id,
                paddleY: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
            };
            state.scores[socket.id] = 0;
            foundRoom = true;
            break;
        }
    }

    if (!foundRoom) {
        currentRoom = `room-${Math.random().toString(36).substring(2, 7)}`;
        const newGame: GameState = {
            roomName: currentRoom,
            players: {
                [socket.id]: {
                    id: socket.id,
                    paddleY: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
                }
            },
            ball: {
                x: CANVAS_WIDTH / 2,
                y: CANVAS_HEIGHT / 2,
                dx: 5,
                dy: 5,
                radius: BALL_RADIUS,
            },
            scores: {
                [socket.id]: 0
            },
            playerIds: [socket.id]
        };
        gameRooms.set(currentRoom, newGame);
    }

    socket.join(currentRoom!);
    console.log(`Player ${socket.id} joined room ${currentRoom}`);

    const initialState = gameRooms.get(currentRoom!)
    if (initialState) {
      socket.emit('gameState', initialState);
      if (initialState.playerIds.length === 2) {
        io.to(currentRoom!).emit('playerJoined', { playerId: socket.id, room: currentRoom });
        io.to(currentRoom!).emit('gameState', initialState);
        startGameLoop(currentRoom!);
      }
    }

    socket.on('paddleMove', (data: PaddleMovePayload) => {
        if (currentRoom && gameRooms.has(currentRoom)) {
            const roomState = gameRooms.get(currentRoom)!;
            if (roomState.players[socket.id]) {
                let newY = data.y;
                if (newY < 0) newY = 0;
                if (newY + PADDLE_HEIGHT > CANVAS_HEIGHT) newY = CANVAS_HEIGHT - PADDLE_HEIGHT;
                roomState.players[socket.id].paddleY = newY;
                socket.to(currentRoom).emit('opponentPaddleMove', { playerId: socket.id, y: newY });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (currentRoom && gameRooms.has(currentRoom)) {
            const roomState = gameRooms.get(currentRoom)!;
            roomState.playerIds = roomState.playerIds.filter(id => id !== socket.id);
            delete roomState.players[socket.id];
            delete roomState.scores[socket.id];

            if (roomState.playerIds.length < 2) {
                io.to(currentRoom).emit('playerLeft', { playerId: socket.id });
                if (gameIntervals[currentRoom]) {
                    clearInterval(gameIntervals[currentRoom]);
                    delete gameIntervals[currentRoom];
                }
                if (roomState.playerIds.length === 0) {
                    gameRooms.delete(currentRoom);
                    console.log(`Room ${currentRoom} deleted.`);
                }
            }
            io.to(currentRoom).emit('gameState', roomState);
        }
    });
});

const gameIntervals: { [roomName: string]: NodeJS.Timeout } = {};

function startGameLoop(roomName: string) {
    if (gameIntervals[roomName]) {
        clearInterval(gameIntervals[roomName]);
    }

    gameIntervals[roomName] = setInterval(() => {
        const gameState = gameRooms.get(roomName);
        if (!gameState || gameState.playerIds.length < 2) {
            clearInterval(gameIntervals[roomName]);
            delete gameIntervals[roomName];
            return;
        }

        const { ball, players, playerIds } = gameState;

        ball.x += ball.dx;
        ball.y += ball.dy;

        if (ball.y + ball.radius > CANVAS_HEIGHT || ball.y - ball.radius < 0) {
            ball.dy *= -1;
        }

        const player1 = players[playerIds[0]];
        const player2 = players[playerIds[1]];

        if (
            ball.x - ball.radius < PADDLE_WIDTH &&
            ball.y > player1.paddleY &&
            ball.y < player1.paddleY + PADDLE_HEIGHT
        ) {
            if (ball.dx < 0) {
              ball.dx *= -1;
            }
        }

        if (
            ball.x + ball.radius > CANVAS_WIDTH - PADDLE_WIDTH &&
            ball.y > player2.paddleY &&
            ball.y < player2.paddleY + PADDLE_HEIGHT
        ) {
          if (ball.dx > 0) {
            ball.dx *= -1;
          }
        }

        if (ball.x - ball.radius < 0) {
            gameState.scores[playerIds[1]]++;
            resetBall(ball, roomName, playerIds[1]);
            io.to(roomName).emit('scoreUpdate', { scores: gameState.scores, scorerId: playerIds[1], roomName });
        } else if (ball.x + ball.radius > CANVAS_WIDTH) {
            gameState.scores[playerIds[0]]++;
            resetBall(ball, roomName, playerIds[0]);
            io.to(roomName).emit('scoreUpdate', { scores: gameState.scores, scorerId: playerIds[0], roomName });
        }

        io.to(roomName).emit('gameState', gameState);
    }, 1000 / 60);
}

function resetBall(ball: Ball, roomName: string, scorerId: string | null) {
    const gameState = gameRooms.get(roomName);
    if (!gameState) {
        console.error(`Attempted to reset ball for non-existent room: ${roomName}`);
        return;
    }

    ball.x = CANVAS_WIDTH / 2;
    ball.y = CANVAS_HEIGHT / 2;

    const player1Id = gameState.playerIds[0]; 

    if (scorerId === null || scorerId === player1Id) {
        ball.dx = 5;
    } else {
        ball.dx = -5;
    }
    ball.dy = Math.random() > 0.5 ? 5 : -5; 
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

app.get('/', (req, res) => {
    res.send('Pong Backend Running');
}); 