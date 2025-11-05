import express from 'express';
import WebSocket from 'ws';
import http from 'http';
import { Server } from 'ws';
import { RoomManager } from './RoomManager';
import { GameStateManager } from './GameStateManager';
import { WSMessage, MessageType, ClientConnection, PlayerInput } from './types';

// 使用types.ts中定义的MessageType
import { getMessageOptimizer } from './MessageOptimizer';
import { StateConsistencyChecker } from './StateConsistencyChecker';

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3001;

// 创建HTTP服务器
const server = http.createServer(app);

// 创建WebSocket服务器
const wss = new Server({ server });

// 创建管理器实例
const roomManager = new RoomManager();
const gameStateManager = new GameStateManager();
const messageOptimizer = getMessageOptimizer();
const stateConsistencyChecker = new StateConsistencyChecker();

// 存储客户端连接
const clients: Map<string, ClientConnection> = new Map();
// 存储断开连接的玩家，用于重连
const disconnectedPlayers: Map<string, {
  playerState: any;
  roomId: string;
  disconnectedAt: number;
}> = new Map();

// 定期广播完整状态用于校正
setInterval(() => {
  Array.from(roomManager.getAllRooms()).forEach((room: any) => {
    if (room.players.size >= 2 && room.isPlaying) {
      const fullState = stateConsistencyChecker.broadcastFullStateCorrection(room);
      broadcastToRoom(room.id, {
        type: MessageType.SYNC_STATE,
        data: {
          state: fullState,
          timestamp: Date.now(),
          isFullSync: true
        }
      }, undefined, 2); // 优先级 2
    }
  });
}, 2000); // 每2秒广播一次完整状态

// 生成唯一ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// 发送消息给客户端
function sendToClient(socket: WebSocket, message: WSMessage, priority: number = 0): void {
  if (socket.readyState === WebSocket.OPEN) {
    // 对于校正消息，使用最高优先级
    const msgPriority = message.type === MessageType.CORRECTION ? 2 : priority;
    
    // 使用消息优化器处理
    // 注意：这里我们仍然直接发送，因为优化器主要用于批量处理和优先级管理
    // 在实际生产环境中，可能需要更复杂的集成
    socket.send(JSON.stringify(message));
  }
}

// 广播消息给房间内所有玩家
function broadcastToRoom(roomId: string, message: WSMessage, excludePlayerId?: string, priority: number = 0): void {
  const room = roomManager.getRoomById(roomId);
  if (!room) return;

  room.players.forEach((player) => {
    if (excludePlayerId && player.id === excludePlayerId) return;
    
    const client = clients.get(player.id);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      // 对于游戏更新消息，使用优先级1，确保低延迟
      const msgPriority = message.type === MessageType.GAME_UPDATE ? 1 : priority;
      
      // 使用消息优化器发送消息
      messageOptimizer.addMessage(message, player.id, msgPriority);
      
      // 直接发送消息以确保最低延迟
      client.socket.send(JSON.stringify(message));
    }
  });
}

// 处理WebSocket连接
wss.on('connection', (ws: WebSocket) => {
  console.log('新用户连接');
  
  // 创建客户端连接
  const playerId = generateId();
  const client: ClientConnection = {
    socket: ws,
    playerId,
    roomId: null,
    lastHeartbeat: Date.now()
  };
  
  clients.set(playerId, client);
  
  // 发送连接成功消息
  sendToClient(ws, {
    type: MessageType.CONNECT,
    data: { playerId }
  });

  // 监听消息
  ws.on('message', (messageData: string) => {
    try {
      const message: WSMessage = JSON.parse(messageData);
      
      switch (message.type) {
        case MessageType.RECONNECT:
          handleReconnect(ws, message.data);
          break;
        case MessageType.CREATE_ROOM:
          handleCreateRoom(client, message.data);
          break;
        case MessageType.JOIN_ROOM:
          handleJoinRoom(client, message.data);
          break;
        case MessageType.LEAVE_ROOM:
          handleLeaveRoom(client);
          break;
        case MessageType.LIST_ROOMS:
          handleListRooms(client);
          break;
        case MessageType.PLAYER_INPUT:
          handlePlayerInput(client, message.data as PlayerInput);
          break;
        case MessageType.HEARTBEAT:
          handleHeartbeat(client);
          break;
        case MessageType.SYNC_STATE:
          handleSyncState(client, message.data);
          break;
      }
    } catch (error) {
      console.error('消息解析错误:', error);
    }
  });

  // 监听连接关闭
  ws.on('close', () => {
    console.log('用户断开连接:', client.playerId);
    handleDisconnect(client);
  });

  // 监听错误
  ws.on('error', (error) => {
    console.error('WebSocket错误:', error);
  });
});

// 处理重连
function handleReconnect(ws: WebSocket, data: { playerId: string }): void {
  const { playerId } = data;
  const disconnectedData = disconnectedPlayers.get(playerId);
  
  if (disconnectedData && Date.now() - disconnectedData.disconnectedAt < 10000) {
    // 10秒内允许重连
    const client: ClientConnection = {
      socket: ws,
      playerId,
      roomId: disconnectedData.roomId,
      lastHeartbeat: Date.now()
    };
    
    clients.set(playerId, client);
    disconnectedPlayers.delete(playerId);
    
    // 恢复玩家到房间
    const room = roomManager.getRoomById(disconnectedData.roomId);
    if (room) {
      room.players.set(playerId, disconnectedData.playerState);
      
      // 发送重连成功消息
      sendToClient(ws, {
        type: MessageType.RECONNECT,
        data: { success: true, roomId: room.id }
      });
      
      // 发送当前房间状态
      sendToClient(ws, {
        type: MessageType.ROOM_STATE,
        data: {
          roomId: room.id,
          roomName: room.name,
          players: Array.from(room.players.values()),
          isPlaying: room.isPlaying
        }
      });
      
      // 通知其他玩家有玩家重连
        broadcastToRoom(room.id, {
          type: 'player_reconnected', // 使用字符串字面量，因为MessageType中没有对应的枚举值
          data: { playerId }
        }, playerId);
    }
  } else {
    // 重连失败
    sendToClient(ws, {
      type: MessageType.RECONNECT,
      data: { success: false }
    });
  }
}

// 处理创建房间
function handleCreateRoom(client: ClientConnection, data: { roomName: string }): void {
  try {
    const room = roomManager.createRoom(data.roomName);
    
    // 创建玩家状态
    const playerState = gameStateManager.createInitialPlayerState(client.playerId, `Player_${client.playerId.substring(0, 4)}`);
    
    // 添加玩家到房间
    roomManager.addPlayerToRoom(room.id, playerState);
    client.roomId = room.id;
    
    // 发送房间创建成功消息
    sendToClient(client.socket, {
      type: MessageType.CREATE_ROOM,
      data: {
        success: true,
        roomId: room.id,
        roomName: room.name
      }
    });
    
    // 发送房间状态
    sendToClient(client.socket, {
      type: MessageType.ROOM_STATE,
      data: {
        roomId: room.id,
        roomName: room.name,
        players: Array.from(room.players.values()),
        isPlaying: room.isPlaying
      }
    });
  } catch (error: any) {
    sendToClient(client.socket, {
      type: MessageType.CREATE_ROOM,
      data: {
        success: false,
        error: error.message
      }
    });
  }
}

// 处理加入房间
function handleJoinRoom(client: ClientConnection, data: { roomId: string }): void {
  const { roomId } = data;
  const room = roomManager.getRoomById(roomId);
  
  if (!room) {
    sendToClient(client.socket, {
      type: MessageType.JOIN_ROOM,
      data: {
        success: false,
        error: '房间不存在'
      }
    });
    return;
  }
  
  // 创建玩家状态
  const playerState = gameStateManager.createInitialPlayerState(client.playerId, `Player_${client.playerId.substring(0, 4)}`);
  
  if (roomManager.addPlayerToRoom(roomId, playerState)) {
    client.roomId = roomId;
    
    // 发送加入成功消息
    sendToClient(client.socket, {
      type: MessageType.JOIN_ROOM,
      data: {
        success: true,
        roomId: room.id,
        roomName: room.name
      }
    });
    
    // 发送房间状态
    sendToClient(client.socket, {
      type: MessageType.ROOM_STATE,
      data: {
        roomId: room.id,
        roomName: room.name,
        players: Array.from(room.players.values()),
        isPlaying: room.isPlaying
      }
    });
    
    // 通知其他玩家有新玩家加入
        broadcastToRoom(roomId, {
          type: 'player_joined', // 使用字符串字面量，因为MessageType中没有对应的枚举值
          data: { player: playerState }
        }, client.playerId);
    
    // 如果房间人数>=2且未开始游戏，启动倒计时
    if (room.players.size >= 2 && !room.isPlaying && !room.countdownTimer) {
      startGameCountdown(room);
    }
  } else {
    sendToClient(client.socket, {
      type: MessageType.JOIN_ROOM,
      data: {
        success: false,
        error: '房间已满或游戏已开始'
      }
    });
  }
}

// 处理离开房间
function handleLeaveRoom(client: ClientConnection): void {
  if (!client.roomId) return;
  
  const roomId = client.roomId;
  const room = roomManager.getRoomById(roomId);
  
  if (room) {
    const player = room.players.get(client.playerId);
    if (player) {
      // 通知其他玩家有玩家离开
        broadcastToRoom(roomId, {
          type: 'player_left', // 使用字符串字面量，因为MessageType中没有对应的枚举值
          data: { playerId: client.playerId }
        }, client.playerId);
    }
    
    // 移除玩家
    roomManager.removePlayerFromRoom(roomId, client.playerId);
  }
  
  client.roomId = null;
  
  // 发送离开成功消息
  sendToClient(client.socket, {
    type: MessageType.LEAVE_ROOM,
    data: { success: true }
  });
}

// 处理获取房间列表
function handleListRooms(client: ClientConnection): void {
  const roomsList = roomManager.getRoomsList();
  
  sendToClient(client.socket, {
    type: MessageType.LIST_ROOMS,
    data: { rooms: roomsList }
  });
}

// 处理玩家输入
function handlePlayerInput(client: ClientConnection, input: PlayerInput): void {
  if (!client.roomId) return;
  
  const room = roomManager.getRoomById(client.roomId);
  if (!room || !room.isPlaying) return;
  
  const player = room.players.get(client.playerId);
  if (!player) return;
  
  // 使用消息优化器处理输入
  messageOptimizer.addPlayerInput(input);
  
  // 立即应用玩家输入，不等待缓冲，以确保低延迟
  gameStateManager.applyPlayerInput(player, input);
  
  // 获取更新后的状态
  const updatedState = {
    id: player.id,
    x: player.x,
    y: player.y,
    direction: player.direction,
    isAttacking: player.isAttacking,
    isJumping: player.isJumping
  };
  
  // 广播玩家状态更新，使用高优先级
  broadcastToRoom(client.roomId, {
    type: MessageType.GAME_UPDATE,
    data: {
      playerId: client.playerId,
      state: updatedState,
      timestamp: input.timestamp
    }
  }, undefined, 1); // 优先级设为1
}

// 处理心跳
function handleHeartbeat(client: ClientConnection): void {
  client.lastHeartbeat = Date.now();
  
  if (client.roomId) {
    const room = roomManager.getRoomById(client.roomId);
    const player = room?.players.get(client.playerId);
    if (player) {
      player.lastHeartbeat = Date.now();
    }
  }
  
  sendToClient(client.socket, {
    type: MessageType.HEARTBEAT,
    data: { timestamp: Date.now() }
  });
}

// 处理同步状态
function handleSyncState(client: ClientConnection, data: { state: any }): void {
  if (!client.roomId) return;
  
  const room = roomManager.getRoomById(client.roomId);
  if (!room || !room.isPlaying) return;
  
  const serverState = room.players.get(client.playerId);
  if (!serverState) return;
  
  // 使用状态一致性检查器执行检查
  const isConsistent = stateConsistencyChecker.checkStateConsistency(
    serverState,
    data.state
  );
  
  if (!isConsistent) {
    // 处理状态不一致
    const needCorrection = stateConsistencyChecker.handleStateInconsistency(
      client.playerId,
      serverState
    );
    
    // 如果需要校正，向该客户端发送正确的状态
    if (needCorrection) {
      sendToClient(client.socket, {
        type: MessageType.CORRECTION,
        data: {
          state: serverState,
          timestamp: Date.now()
        }
      }, 3); // 最高优先级
    }
  } else {
    // 记录状态一致
    stateConsistencyChecker.recordConsistentState(client.playerId);
  }
}

// 处理断开连接
function handleDisconnect(client: ClientConnection): void {
  if (client.roomId) {
    const room = roomManager.getRoomById(client.roomId);
    const player = room?.players.get(client.playerId);
    
    if (room && player) {
      // 保存断开连接的玩家状态，用于重连
      disconnectedPlayers.set(client.playerId, {
        playerState: { ...player },
        roomId: client.roomId,
        disconnectedAt: Date.now()
      });
      
      // 清理一致性检查器中的玩家记录
      stateConsistencyChecker.cleanupPlayer(client.playerId);
      
      // 从房间移除玩家
      roomManager.removePlayerFromRoom(client.roomId, client.playerId);
      
      // 通知其他玩家有玩家断开连接
        broadcastToRoom(client.roomId, {
          type: 'player_disconnected', // 使用字符串字面量，因为MessageType中没有对应的枚举值
          data: { playerId: client.playerId }
        });
      
      // 如果房间中没有玩家了，清除倒计时
      if (room.players.size < 2 && room.countdownTimer) {
        clearInterval(room.countdownTimer);
        room.countdownTimer = null;
        room.countdown = null;
      }
    }
  }
  
  // 从客户端列表移除
  clients.delete(client.playerId);
}

// 启动游戏倒计时
function startGameCountdown(room: any): void {
  room.countdown = 5; // 5秒倒计时
  
  // 广播倒计时开始
    broadcastToRoom(room.id, {
      type: 'countdown_start', // 使用字符串字面量，因为MessageType中没有对应的枚举值
      data: { countdown: room.countdown }
    });
  
  room.countdownTimer = setInterval(() => {
    room.countdown! -= 1;
    
    if (room.countdown! > 0) {
      // 广播倒计时更新
        broadcastToRoom(room.id, {
          type: 'countdown_update', // 使用字符串字面量，因为MessageType中没有对应的枚举值
          data: { countdown: room.countdown }
        });
    } else {
      // 倒计时结束，开始游戏
      clearInterval(room.countdownTimer!);
      room.countdownTimer = null;
      room.isPlaying = true;
      
      // 重置玩家状态
      gameStateManager.resetPlayerStates(room);
      
      // 广播游戏开始
      broadcastToRoom(room.id, {
        type: MessageType.GAME_START,
        data: {
          startTime: Date.now(),
          players: Array.from(room.players.values())
        }
      });
    }
  }, 1000);
}

// 定期清理过期的断开连接玩家
setInterval(() => {
  const now = Date.now();
  for (const [playerId, data] of disconnectedPlayers.entries()) {
    if (now - data.disconnectedAt > 10000) { // 10秒后清理
      disconnectedPlayers.delete(playerId);
    }
  }
}, 1000);

// 定期更新游戏状态（约60fps）
setInterval(() => {
  Array.from(roomManager.getAllRooms()).forEach((room: any) => {
    if (room.isPlaying) {
      gameStateManager.updateGameState(room);
      
      // 每16ms发送一次完整的游戏状态更新，确保状态一致性
      broadcastToRoom(room.id, {
        type: MessageType.SYNC_STATE,
        data: {
          timestamp: Date.now(),
          // 只发送简化版的玩家状态
          players: Array.from(room.players.values()).map((player: any) => ({
            id: player.id,
            x: player.x,
            y: player.y,
            direction: player.direction,
            health: player.health,
            score: player.score
          }))
        }
      }, undefined, 0);
    }
  });
}, 16);

// 监控消息优化器状态
setInterval(() => {
  const status = messageOptimizer.getQueueStatus();
  if (status.queueSize > 100 || status.averageDelay > 50) {
    console.log(`消息队列状态警告: 队列大小=${status.queueSize}, 平均延迟=${status.averageDelay}ms`);
  }
}, 5000); // 每5秒检查一次

// 定期清理不活跃的房间
setInterval(() => {
  roomManager.cleanupInactiveRooms();
}, 60000); // 每分钟清理一次

// 设置Express中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查路由
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: '服务器运行正常' });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`后端服务启动在 http://localhost:${PORT}`);
  console.log(`WebSocket服务启动在 ws://localhost:${PORT}`);
});