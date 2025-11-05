import { WSMessage, WSMessageType, PlayerInput, PlayerState } from './types';

export interface WebSocketClientOptions {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export interface MessageHandler {
  (message: WSMessage<any>): void;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private heartbeatInterval: number;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Map<WSMessageType | 'any', Set<MessageHandler>> = new Map();
  private isConnecting = false;
  private isConnected = false;
  private messageQueue: WSMessage<any>[] = [];
  private playerId: string = '';
  private roomId: string = '';

  constructor(options: WebSocketClientOptions) {
    this.url = options.url;
    this.reconnectInterval = options.reconnectInterval || 1000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.heartbeatInterval = options.heartbeatInterval || 5000;
  }

  // 连接WebSocket服务器
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting || this.isConnected) {
        resolve();
        return;
      }

      this.isConnecting = true;

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.isConnecting = false;
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.flushMessageQueue();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WSMessage<any> = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.isConnecting = false;
          this.isConnected = false;
          this.stopHeartbeat();
          this.attemptReconnect();
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  // 断开连接
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
  }

  // 发送消息
  send<T>(message: WSMessage<T>): boolean {
    if (!this.isConnected || !this.ws) {
      // 如果未连接，加入消息队列
      this.messageQueue.push(message);
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      // 发送失败，加入队列
      this.messageQueue.push(message);
      return false;
    }
  }

  // 处理接收到的消息
  private handleMessage(message: WSMessage<any>): void {
    // 处理特定类型的消息
    const typeHandlers = this.messageHandlers.get(message.type);
    if (typeHandlers) {
      typeHandlers.forEach(handler => handler(message));
    }

    // 处理所有类型的消息的通用处理器
    const anyHandlers = this.messageHandlers.get('any');
    if (anyHandlers) {
      anyHandlers.forEach(handler => handler(message));
    }

    // 处理其他类型消息
  // 不再处理'pong'类型，因为它不在WSMessageType枚举中
  }

  // 注册消息处理器
  on<T extends WSMessageType>(type: T | 'any', handler: MessageHandler): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
  }

  // 移除消息处理器
  off<T extends WSMessageType>(type: T | 'any', handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.messageHandlers.delete(type);
      }
    }
  }

  // 尝试重新连接
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, this.reconnectInterval);
  }

  // 启动心跳
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, this.heartbeatInterval);
  }

  // 停止心跳
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // 刷新消息队列
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected && this.ws) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  // 设置玩家ID
  setPlayerId(playerId: string): void {
    this.playerId = playerId;
  }

  // 获取玩家ID
  getPlayerId(): string {
    return this.playerId;
  }

  // 设置房间ID
  setRoomId(roomId: string): void {
    this.roomId = roomId;
  }

  // 获取房间ID
  getRoomId(): string {
    return this.roomId;
  }

  // 检查连接状态
  isConnectedToServer(): boolean {
    return this.isConnected;
  }

  // 发送玩家输入
  sendPlayerInput(input: PlayerInput): void {
    this.send({
      type: WSMessageType.PLAYER_INPUT,
      data: input,
      timestamp: Date.now()
    });
  }

  // 发送客户端状态报告（用于一致性检查）
  sendClientStateReport(playerId: string, state: Partial<PlayerState>): void {
    this.send({
      type: WSMessageType.CLIENT_STATE_REPORT,
      data: {
        playerId,
        state
      },
      timestamp: Date.now()
    });
  }

  // 创建房间
  createRoom(roomName: string, isPublic: boolean = true, maxPlayers: number = 4): void {
    this.send({
      type: WSMessageType.CREATE_ROOM,
      data: {
        name: roomName,
        isPublic,
        maxPlayers
      },
      timestamp: Date.now()
    });
  }

  // 加入房间
  joinRoom(roomId: string): void {
    this.send({
      type: WSMessageType.JOIN_ROOM,
      data: { roomId },
      timestamp: Date.now()
    });
  }

  // 离开房间
  leaveRoom(): void {
    this.send({
      type: WSMessageType.LEAVE_ROOM,
      data: {},
      timestamp: Date.now()
    });
    this.roomId = '';
  }

  // 请求房间列表
  requestRoomList(): void {
    this.send({
      type: WSMessageType.ROOM_LIST,
      data: {},
      timestamp: Date.now()
    });
  }

  // 尝试重连
  reconnect(playerId: string, roomId: string): void {
    this.playerId = playerId;
    this.roomId = roomId;
    this.send({
      type: WSMessageType.RECONNECT,
      data: { playerId, roomId },
      timestamp: Date.now()
    });
  }
}