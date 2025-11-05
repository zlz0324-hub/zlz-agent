import { PlayerState, Room } from './types';

/**
 * 状态一致性检查器类
 * 负责检测玩家状态不一致并执行校正
 */
export class StateConsistencyChecker {
  private static readonly MAX_POSITION_DIFF = 0.5; // 最大允许位置偏差
  private static readonly MAX_VELOCITY_DIFF = 0.3; // 最大允许速度偏差
  private static readonly BROADCAST_INTERVAL = 2000; // 状态广播间隔（毫秒）
  private static readonly TOLERANCE_COUNT = 3; // 连续不一致次数阈值
  
  // 记录玩家状态不一致次数
  private inconsistentStateCount: Map<string, number> = new Map();

  /**
   * 检查玩家状态是否一致
   * @param serverState 服务器记录的玩家状态
   * @param clientState 客户端报告的玩家状态
   * @returns 是否一致
   */
  checkStateConsistency(serverState: PlayerState, clientState: Partial<PlayerState>): boolean {
    // 检查位置一致性
    if ('x' in clientState && 'y' in clientState && !this.checkPositionConsistency(serverState, clientState)) {
      return false;
    }

    // 检查速度一致性
    if ('velocityX' in clientState && 'velocityY' in clientState && !this.checkVelocityConsistency(serverState, clientState)) {
      return false;
    }

    // 检查生命值一致性
    if (clientState.health !== undefined && Math.abs(serverState.health - clientState.health) > 0.1) {
      return false;
    }

    // 检查状态标志一致性
    if (clientState.isJumping !== undefined && clientState.isJumping !== serverState.isJumping) {
      return false;
    }

    return true;
  }

  /**
   * 检查位置一致性
   */
  private checkPositionConsistency(serverState: PlayerState, clientState: Partial<PlayerState>): boolean {
    const dx = Math.abs(serverState.x - (clientState.x || 0));
    const dy = Math.abs(serverState.y - (clientState.y || 0));
    return dx < StateConsistencyChecker.MAX_POSITION_DIFF && dy < StateConsistencyChecker.MAX_POSITION_DIFF;
  }

  /**
   * 检查速度一致性
   */
  private checkVelocityConsistency(serverState: PlayerState, clientState: Partial<PlayerState>): boolean {
    const dvX = Math.abs(serverState.velocityX - (clientState.velocityX || 0));
    const dvY = Math.abs(serverState.velocityY - (clientState.velocityY || 0));
    return dvX < StateConsistencyChecker.MAX_VELOCITY_DIFF && dvY < StateConsistencyChecker.MAX_VELOCITY_DIFF;
  }

  /**
   * 处理状态不一致
   * @param playerId 玩家ID
   * @param serverState 服务器状态
   * @returns 是否需要发送校正
   */
  handleStateInconsistency(playerId: string, serverState: PlayerState): boolean {
    const count = (this.inconsistentStateCount.get(playerId) || 0) + 1;
    this.inconsistentStateCount.set(playerId, count);

    // 如果连续不一致次数超过阈值，需要发送校正
    if (count >= StateConsistencyChecker.TOLERANCE_COUNT) {
      this.inconsistentStateCount.set(playerId, 0); // 重置计数
      return true;
    }

    return false;
  }

  /**
   * 记录状态一致
   */
  recordConsistentState(playerId: string): void {
    this.inconsistentStateCount.delete(playerId);
  }

  /**
   * 广播房间完整状态进行校正
   * @param room 房间对象
   */
  broadcastFullStateCorrection(room: Room): PlayerState[] {
    return Array.from(room.players.values()).map(player => player);
  }

  /**
   * 获取需要发送校正的玩家列表
   */
  getPlayersRequiringCorrection(): string[] {
    return Array.from(this.inconsistentStateCount.entries())
      .filter(([_, count]) => count >= StateConsistencyChecker.TOLERANCE_COUNT)
      .map(([playerId]) => playerId);
  }

  /**
   * 清理玩家的不一致记录
   */
  cleanupPlayer(playerId: string): void {
    this.inconsistentStateCount.delete(playerId);
  }
}