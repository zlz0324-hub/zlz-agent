import { Room, PlayerState, PlayerInput } from './types';

export class GameStateManager {
  private updateInterval: number = 16; // 约60fps
  private gravity: number = 0.5;
  private maxVelocity: number = 10;
  private friction: number = 0.8;
  private jumpForce: number = -15;

  // 更新游戏状态
  updateGameState(room: Room, deltaTime: number = 16): void {
    if (!room.isPlaying) return;

    // 更新每个玩家的状态
    room.players.forEach((player, playerId) => {
      this.updatePlayerState(player, deltaTime);
    });
  }

  // 根据玩家输入更新玩家状态
  applyPlayerInput(player: PlayerState, input: PlayerInput): void {
    // 更新位置和方向
    player.x = input.x;
    player.y = input.y;
    player.direction = input.direction;

    // 应用动作
    if (input.actions.attack) {
      player.isAttacking = true;
      // 攻击动作持续时间
      setTimeout(() => {
        player.isAttacking = false;
      }, 300);
    }

    if (input.actions.jump && !player.isJumping) {
      player.isJumping = true;
      player.velocityY = this.jumpForce;
    }

    // 更新水平速度
    if (input.actions.moveLeft) {
      player.velocityX = -this.maxVelocity;
    } else if (input.actions.moveRight) {
      player.velocityX = this.maxVelocity;
    } else {
      player.velocityX *= this.friction;
      if (Math.abs(player.velocityX) < 0.1) player.velocityX = 0;
    }

    // 更新垂直速度（如果在地面上，重置跳跃状态）
    if (player.y >= 0) { // 假设y=0是地面
      player.isJumping = false;
      player.y = 0;
      player.velocityY = 0;
    }

    player.lastHeartbeat = Date.now();
  }

  // 更新单个玩家状态（物理模拟）
  private updatePlayerState(player: PlayerState, deltaTime: number): void {
    // 应用重力
    if (player.isJumping) {
      player.velocityY += this.gravity * (deltaTime / this.updateInterval);
    }

    // 更新位置
    player.x += player.velocityX * (deltaTime / this.updateInterval);
    player.y += player.velocityY * (deltaTime / this.updateInterval);

    // 边界检查（简单实现，假设地图边界为0-1000）
    if (player.x < 0) player.x = 0;
    if (player.x > 1000) player.x = 1000;
    if (player.y < 0) player.y = 0;
    if (player.y > 800) player.y = 800;

    // 地面碰撞检测
    if (player.y >= 0) {
      player.isJumping = false;
      player.y = 0;
      player.velocityY = 0;
    }

    // 限制最大速度
    player.velocityX = Math.max(-this.maxVelocity, Math.min(this.maxVelocity, player.velocityX));
    player.velocityY = Math.max(-this.maxVelocity, Math.min(this.maxVelocity, player.velocityY));
  }

  // 检查状态一致性并生成校正数据
  checkConsistency(serverState: PlayerState, clientState: PlayerState): boolean {
    const positionTolerance = 5; // 位置误差容忍度
    const velocityTolerance = 2; // 速度误差容忍度

    // 检查位置误差
    const positionError = Math.sqrt(
      Math.pow(serverState.x - clientState.x, 2) + 
      Math.pow(serverState.y - clientState.y, 2)
    );

    // 检查速度误差
    const velocityError = Math.sqrt(
      Math.pow(serverState.velocityX - clientState.velocityX, 2) + 
      Math.pow(serverState.velocityY - clientState.velocityY, 2)
    );

    // 检查方向误差
    const directionError = Math.abs(serverState.direction - clientState.direction);

    return positionError <= positionTolerance &&
           velocityError <= velocityTolerance &&
           directionError <= 0.1;
  }

  // 创建初始玩家状态
  createInitialPlayerState(playerId: string, playerName: string): PlayerState {
    return {
      id: playerId,
      name: playerName,
      x: Math.random() * 200 + 50, // 随机初始位置
      y: 0,
      velocityX: 0,
      velocityY: 0,
      direction: 1, // 1表示右，-1表示左
      isAttacking: false,
      isJumping: false,
      health: 100,
      score: 0,
      lastHeartbeat: Date.now()
    };
  }

  // 重置房间内所有玩家状态
  resetPlayerStates(room: Room): void {
    room.players.forEach((player) => {
      player.x = Math.random() * 200 + 50;
      player.y = 0;
      player.velocityX = 0;
      player.velocityY = 0;
      player.health = 100;
      player.score = 0;
      player.isAttacking = false;
      player.isJumping = false;
    });
  }
}