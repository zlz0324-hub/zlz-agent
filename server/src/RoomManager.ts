import { Room, PlayerState } from './types';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private maxRooms: number = 100;
  private maxPlayersPerRoom: number = 4;

  // 创建新房间
  createRoom(name: string): Room {
    if (this.rooms.size >= this.maxRooms) {
      throw new Error('房间数量已达上限');
    }

    const id = this.generateRoomId();
    const room: Room = {
      id,
      name,
      players: new Map(),
      maxPlayers: this.maxPlayersPerRoom,
      isPlaying: false,
      countdown: null,
      countdownTimer: null,
      createdAt: Date.now()
    };

    this.rooms.set(id, room);
    return room;
  }

  // 获取房间列表
  getRoomsList(): Array<{
    id: string;
    name: string;
    playerCount: number;
    maxPlayers: number;
    isPlaying: boolean;
  }> {
    return Array.from(this.rooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      isPlaying: room.isPlaying
    }));
  }

  // 根据ID查找房间
  getRoomById(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  // 添加玩家到房间
  addPlayerToRoom(roomId: string, player: PlayerState): boolean {
    const room = this.getRoomById(roomId);
    if (!room) {
      return false;
    }

    if (room.players.size >= room.maxPlayers) {
      return false;
    }

    if (room.isPlaying) {
      return false;
    }

    room.players.set(player.id, player);
    return true;
  }

  // 从房间移除玩家
  removePlayerFromRoom(roomId: string, playerId: string): boolean {
    const room = this.getRoomById(roomId);
    if (!room) {
      return false;
    }

    const result = room.players.delete(playerId);
    
    // 如果房间为空，删除房间
    if (room.players.size === 0) {
      this.deleteRoom(roomId);
    }

    return result;
  }

  // 删除房间
  deleteRoom(roomId: string): boolean {
    const room = this.getRoomById(roomId);
    if (room && room.countdownTimer) {
      clearInterval(room.countdownTimer);
    }
    return this.rooms.delete(roomId);
  }

  // 检查房间是否可以开始游戏
  canStartGame(roomId: string): boolean {
    const room = this.getRoomById(roomId);
    return room ? room.players.size >= 2 : false;
  }

  // 设置房间为游戏中状态
  setRoomPlaying(roomId: string, isPlaying: boolean): boolean {
    const room = this.getRoomById(roomId);
    if (!room) {
      return false;
    }
    room.isPlaying = isPlaying;
    return true;
  }

  // 生成唯一的房间ID
  private generateRoomId(): string {
    let id: string;
    do {
      id = Math.random().toString(36).substring(2, 10).toUpperCase();
    } while (this.rooms.has(id));
    return id;
  }

  // 清理过期房间（可选功能）
  cleanupInactiveRooms(): void {
    const now = Date.now();
    const timeout = 1000 * 60 * 10; // 10分钟

    for (const [id, room] of this.rooms.entries()) {
      if (room.players.size === 0 && now - room.createdAt > timeout) {
        this.deleteRoom(id);
      }
    }
  }
  
  // 获取所有房间（用于系统内部操作）
  getAllRooms(): IterableIterator<Room> {
    return this.rooms.values();
  }
}