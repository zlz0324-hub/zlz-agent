// 基础类型定义
export interface Vector2D {
  x: number;
  y: number;
}

export interface PlayerState {
  id: string;
  name: string;
  position: Vector2D;
  velocity: Vector2D;
  direction: number; // 0-359度
  health: number;
  energy: number;
  isJumping: boolean;
  isAttacking: boolean;
  isMoving: boolean;
}

export interface Player {
  id: string;
  name: string;
  state: PlayerState;
  socketId?: string;
}

export interface Room {
  id: string;
  name: string;
  players: Map<string, Player>;
  maxPlayers: number;
  isPublic: boolean;
  gameStarted: boolean;
  countdown?: number;
}

export enum WSMessageType {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  CREATE_ROOM = 'create_room',
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  ROOM_LIST = 'room_list',
  PLAYER_JOINED = 'player_joined',
  PLAYER_LEFT = 'player_left',
  START_GAME = 'start_game',
  GAME_STARTED = 'game_started',
  PLAYER_INPUT = 'player_input',
  PLAYER_STATE_UPDATE = 'player_state_update',
  RECONNECT = 'reconnect',
  RECONNECT_SUCCESS = 'reconnect_success',
  RECONNECT_FAILED = 'reconnect_failed',
  COUNTDOWN_START = 'countdown_start',
  COUNTDOWN_UPDATE = 'countdown_update',
  COUNTDOWN_END = 'countdown_end',
  SYNC_STATE = 'sync_state',
  CLIENT_STATE_REPORT = 'client_state_report',
  STATE_CORRECTION = 'state_correction'
}

export interface WSMessage<T = any> {
  type: WSMessageType | string; // 允许使用枚举或字符串字面量
  data: T;
  timestamp?: number;
  priority?: number;
}

export interface PlayerInput {
  action: 'move' | 'jump' | 'attack' | 'stop';
  direction?: number;
  position?: Vector2D;
  timestamp: number;
}

export interface ConnectResponse {
  playerId: string;
  message: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  isPublic: boolean;
  gameStarted: boolean;
}

export interface CreateRoomData {
  name: string;
  isPublic?: boolean;
  maxPlayers?: number;
}

export interface JoinRoomData {
  roomId: string;
}

export interface ReconnectData {
  playerId: string;
  roomId: string;
}