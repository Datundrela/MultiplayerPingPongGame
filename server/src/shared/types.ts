export interface Player {
    id: string;
    paddleY: number;
}

export interface Ball {
    x: number;
    y: number;
    dx: number;
    dy: number;
    radius: number;
}

export interface GameState {
    players: { [id: string]: Player };
    ball: Ball;
    scores: { [id: string]: number };
    roomName: string;
    playerIds: string[];
}

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const PADDLE_HEIGHT = 100;
export const PADDLE_WIDTH = 10;
export const BALL_RADIUS = 7;
export const PADDLE_SPEED = 15;

export interface PaddleMovePayload {
    y: number;
}

export interface OpponentPaddleMovePayload {
    playerId: string;
    y: number;
}

export interface ScoreUpdatePayload {
    scores: { [id: string]: number };
    scorerId: string;
    roomName: string;
}

export interface PlayerJoinedPayload {
    playerId: string;
    room: string;
}

export interface PlayerLeftPayload {
    playerId: string;
} 