import WebSocket from 'ws';

// 玩家状态类型
export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  direction: number;
  isAttacking: boolean;
  isJumping: boolean;
  health: number;
  score: number;
  lastHeartbeat: number;
}

// 房间状态类型
export interface Room {
  id: string;
  name: string;
  players: Map<string, PlayerState>;
  maxPlayers: number;
  isPlaying: boolean;
  countdown: number | null;
  countdownTimer: NodeJS.Timeout | null;
  createdAt: number;
}

// WebSocket消息类型
export interface WSMessage<T = any> {
  type: MessageType | string; // 允许使用MessageType枚举或字符串字面量
  data: T;
  timestamp?: number;
  priority?: number; // 消息优先级，用于消息优化器
}

// 消息类型常量
export enum MessageType {
  // 连接管理
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  RECONNECT = 'reconnect',
  HEARTBEAT = 'heartbeat',
  
  // 房间操作
  CREATE_ROOM = 'create_room',
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  LIST_ROOMS = 'list_rooms',
  ROOM_STATE = 'room_state',
  
  // 游戏操作
  PLAYER_INPUT = 'player_input',
  GAME_UPDATE = 'game_update',
  GAME_START = 'game_start',
  GAME_OVER = 'game_over',
  
  // 同步操作
  SYNC_STATE = 'sync_state',
  CORRECTION = 'correction',
  STATE_CORRECTION = 'state_correction'
}

// 玩家输入类型
export interface PlayerInput {
  id: string;
  x: number;
  y: number;
  direction: number;
  actions: {
    moveLeft?: boolean;
    moveRight?: boolean;
    moveUp?: boolean;
    moveDown?: boolean;
    attack?: boolean;
    jump?: boolean;
  };
  timestamp: number;
}

// 客户端连接类型
export interface ClientConnection {
  socket: WebSocket;
  playerId: string;
  roomId: string | null;
  lastHeartbeat: number;
}