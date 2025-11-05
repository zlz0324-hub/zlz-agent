import { PlayerState, Vector2D, PlayerInput, WSMessageType, Player } from './types';
import { WebSocketClient } from './WebSocketClient';

export interface GameStateManagerOptions {
  webSocketClient: WebSocketClient;
  canvas: HTMLCanvasElement;
  playerId: string;
  renderInterval?: number;
  stateReportInterval?: number;
}

export class GameStateManager {
  private webSocketClient: WebSocketClient;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private playerId: string;
  private players: Map<string, PlayerState> = new Map();
  private keys: Map<string, boolean> = new Map();
  private renderInterval: number;
  private stateReportInterval: number;
  private renderTimer: ReturnType<typeof setInterval> | null = null;
  private stateReportTimer: ReturnType<typeof setInterval> | null = null;
  private lastUpdateTime = 0;
  private isGameStarted = false;
  private isCountingDown = false;
  private countdown = 0;
  private roomId = '';

  constructor(options: GameStateManagerOptions) {
    this.webSocketClient = options.webSocketClient;
    this.canvas = options.canvas;
    this.playerId = options.playerId;
    this.renderInterval = options.renderInterval || 16; // ~60 FPS
    this.stateReportInterval = options.stateReportInterval || 500; // 每500ms报告一次状态

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) {
      throw new Error('Failed to get canvas context');
    }

    this.setupEventListeners();
    this.setupWebSocketListeners();
  }

  // 设置事件监听器
  private setupEventListeners(): void {
    // 键盘事件
    window.addEventListener('keydown', (e) => {
      this.keys.set(e.key.toLowerCase(), true);
      this.handleKeyboardInput();
    });

    window.addEventListener('keyup', (e) => {
      this.keys.set(e.key.toLowerCase(), false);
      this.handleKeyboardInput();
    });

    // 触摸事件（移动设备支持）
    this.canvas.addEventListener('touchstart', this.handleTouch.bind(this), { passive: true });
    this.canvas.addEventListener('touchmove', this.handleTouch.bind(this), { passive: true });
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
  }

  // 设置WebSocket监听器
  private setupWebSocketListeners(): void {
    this.webSocketClient.on(WSMessageType.PLAYER_STATE_UPDATE, (message) => {
      const { playerId, state } = message.data;
      if (this.players.has(playerId)) {
        const currentState = this.players.get(playerId)!;
        // 使用插值平滑更新其他玩家状态
        if (playerId !== this.playerId) {
          this.smoothUpdatePlayerState(playerId, currentState, state);
        } else {
          // 本地玩家只更新必要的服务器验证状态
          this.players.set(playerId, {
            ...currentState,
            health: state.health,
            energy: state.energy
          });
        }
      } else {
        this.players.set(playerId, state);
      }
    });

    this.webSocketClient.on(WSMessageType.SYNC_STATE, (message) => {
      const { state, isFullSync } = message.data;
      if (isFullSync) {
        // 完整同步，替换所有玩家状态
        this.players.clear();
        state.forEach((playerState: PlayerState) => {
          this.players.set(playerState.id, playerState);
        });
      } else {
        // 部分同步，只更新提供的状态
        state.forEach((playerState: PlayerState) => {
          if (this.players.has(playerState.id)) {
            this.smoothUpdatePlayerState(playerState.id, this.players.get(playerState.id)!, playerState);
          } else {
            this.players.set(playerState.id, playerState);
          }
        });
      }
    });

    this.webSocketClient.on(WSMessageType.STATE_CORRECTION, (message) => {
      const { playerId, state } = message.data;
      if (playerId === this.playerId && this.players.has(playerId)) {
        // 校正本地玩家状态
        console.log('Applying state correction');
        this.players.set(playerId, state);
      }
    });

    this.webSocketClient.on(WSMessageType.GAME_STARTED, () => {
      this.isGameStarted = true;
      this.isCountingDown = false;
    });

    this.webSocketClient.on(WSMessageType.COUNTDOWN_START, (message) => {
      this.isCountingDown = true;
      this.countdown = message.data.countdown || 3;
    });

    this.webSocketClient.on(WSMessageType.COUNTDOWN_UPDATE, (message) => {
      this.countdown = message.data.countdown;
    });

    this.webSocketClient.on(WSMessageType.COUNTDOWN_END, () => {
      this.isCountingDown = false;
    });

    this.webSocketClient.on(WSMessageType.PLAYER_JOINED, (message) => {
      const player = message.data.player;
      if (!this.players.has(player.id)) {
        this.players.set(player.id, player.state);
      }
    });

    this.webSocketClient.on(WSMessageType.PLAYER_LEFT, (message) => {
      const { playerId } = message.data;
      this.players.delete(playerId);
    });
  }

  // 处理键盘输入
  private handleKeyboardInput(): void {
    if (!this.isGameStarted || this.isCountingDown) return;

    const currentPlayer = this.players.get(this.playerId);
    if (!currentPlayer) return;

    let action: 'move' | 'jump' | 'attack' | 'stop' = 'stop';
    let direction = currentPlayer.direction;
    let isMoving = false;

    // 处理移动方向
    if (this.keys.get('w') || this.keys.get('arrowup')) {
      direction = 270; // 上
      isMoving = true;
    } else if (this.keys.get('s') || this.keys.get('arrowdown')) {
      direction = 90; // 下
      isMoving = true;
    }

    if (this.keys.get('a') || this.keys.get('arrowleft')) {
      direction = 180; // 左
      isMoving = true;
    } else if (this.keys.get('d') || this.keys.get('arrowright')) {
      direction = 0; // 右
      isMoving = true;
    }

    // 处理特殊动作
    if (this.keys.get(' ') || this.keys.get('spacebar')) {
      action = 'jump';
    } else if (this.keys.get('j') || this.keys.get('z')) {
      action = 'attack';
    } else if (isMoving) {
      action = 'move';
    }

    // 更新本地状态
    this.updateLocalPlayerState(action, direction, isMoving);

    // 发送输入到服务器
    this.webSocketClient.sendPlayerInput({
      action,
      direction,
      timestamp: Date.now()
    });
  }

  // 处理触摸事件（移动设备）
  private handleTouch(event: TouchEvent): void {
    event.preventDefault();
    if (!this.isGameStarted || this.isCountingDown) return;

    const touches = Array.from(event.touches);
    if (touches.length === 0) return;

    const canvasRect = this.canvas.getBoundingClientRect();
    const touch = touches[0];
    const x = touch.clientX - canvasRect.left;
    const y = touch.clientY - canvasRect.top;

    // 简单的触摸控制：左侧移动，右侧跳跃/攻击
    let action: 'move' | 'jump' | 'attack' | 'stop' = 'stop';
    let direction = 0;

    if (x < canvasRect.width / 2) {
      // 左侧区域：移动
      action = 'move';
      // 根据触摸位置计算方向
      if (y < canvasRect.height / 3) {
        direction = 270; // 上
      } else if (y > 2 * canvasRect.height / 3) {
        direction = 90; // 下
      } else if (x < canvasRect.width / 4) {
        direction = 180; // 左
      } else {
        direction = 0; // 右
      }
    } else {
      // 右侧区域：攻击或跳跃
      if (y < canvasRect.height / 2) {
        action = 'attack';
      } else {
        action = 'jump';
      }
    }

    // 更新本地状态
    this.updateLocalPlayerState(action, direction, action === 'move');

    // 发送输入到服务器
    this.webSocketClient.sendPlayerInput({
      action,
      direction,
      timestamp: Date.now()
    });
  }

  // 处理触摸结束事件
  private handleTouchEnd(): void {
    // 触摸结束时停止移动
    const currentPlayer = this.players.get(this.playerId);
    if (currentPlayer) {
      currentPlayer.isMoving = false;
    }
  }

  // 更新本地玩家状态
  private updateLocalPlayerState(action: string, direction: number, isMoving: boolean): void {
    const currentPlayer = this.players.get(this.playerId);
    if (!currentPlayer) return;

    currentPlayer.direction = direction;
    currentPlayer.isMoving = isMoving;
    currentPlayer.isAttacking = action === 'attack';
    currentPlayer.isJumping = action === 'jump';

    // 简单的客户端预测
    if (isMoving) {
      const speed = 2;
      const radians = (direction * Math.PI) / 180;
      currentPlayer.position.x += Math.cos(radians) * speed;
      currentPlayer.position.y += Math.sin(radians) * speed;
    }
  }

  // 平滑更新玩家状态（插值）
  private smoothUpdatePlayerState(playerId: string, current: PlayerState, target: PlayerState): void {
    const alpha = 0.2; // 插值因子
    
    const newState: PlayerState = {
      ...current,
      position: {
        x: current.position.x + (target.position.x - current.position.x) * alpha,
        y: current.position.y + (target.position.y - current.position.y) * alpha
      },
      velocity: {
        x: target.velocity.x,
        y: target.velocity.y
      },
      direction: target.direction,
      isMoving: target.isMoving,
      isAttacking: target.isAttacking,
      isJumping: target.isJumping,
      health: target.health,
      energy: target.energy
    };

    this.players.set(playerId, newState);
  }

  // 开始游戏循环
  start(): void {
    this.lastUpdateTime = performance.now();
    this.renderTimer = setInterval(() => this.render(), this.renderInterval);
    this.stateReportTimer = setInterval(() => this.reportState(), this.stateReportInterval);
  }

  // 停止游戏循环
  stop(): void {
    if (this.renderTimer) {
      clearInterval(this.renderTimer);
      this.renderTimer = null;
    }
    if (this.stateReportTimer) {
      clearInterval(this.stateReportTimer);
      this.stateReportTimer = null;
    }
  }

  // 渲染游戏画面
  private render(): void {
    if (!this.ctx) return;

    // 清空画布
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 渲染玩家
    this.players.forEach(player => this.renderPlayer(player));

    // 渲染倒计时
    if (this.isCountingDown) {
      this.renderCountdown();
    }

    // 渲染玩家信息
    this.renderPlayerInfo();
  }

  // 渲染单个玩家
  private renderPlayer(player: PlayerState): void {
    if (!this.ctx) return;

    // 设置玩家颜色（本地玩家不同颜色）
    this.ctx.fillStyle = player.id === this.playerId ? '#4CAF50' : '#2196F3';

    // 绘制玩家
    const size = 40;
    this.ctx.fillRect(
      player.position.x - size / 2,
      player.position.y - size / 2,
      size,
      size
    );

    // 绘制方向指示器
    this.ctx.strokeStyle = '#FFF';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    const radians = (player.direction * Math.PI) / 180;
    this.ctx.moveTo(player.position.x, player.position.y);
    this.ctx.lineTo(
      player.position.x + Math.cos(radians) * 25,
      player.position.y + Math.sin(radians) * 25
    );
    this.ctx.stroke();

    // 绘制状态指示器
    if (player.isAttacking) {
      this.ctx.fillStyle = '#FF5722';
      this.ctx.beginPath();
      this.ctx.arc(player.position.x, player.position.y, size / 2 + 10, 0, Math.PI * 2);
      this.ctx.fill();
    }

    if (player.isJumping) {
      this.ctx.fillStyle = '#FFC107';
      this.ctx.beginPath();
      this.ctx.arc(player.position.x, player.position.y - size, size / 3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // 绘制玩家名称
    this.ctx.fillStyle = '#FFF';
    this.ctx.font = '12px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(player.name, player.position.x, player.position.y - size / 2 - 10);
  }

  // 渲染倒计时
  private renderCountdown(): void {
    if (!this.ctx) return;

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    this.ctx.font = 'bold 80px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      this.countdown.toString(),
      this.canvas.width / 2,
      this.canvas.height / 2 + 25
    );
  }

  // 渲染玩家信息
  private renderPlayerInfo(): void {
    if (!this.ctx) return;

    const currentPlayer = this.players.get(this.playerId);
    if (!currentPlayer) return;

    // 绘制状态面板
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(20, 20, 200, 100);

    // 绘制生命值
    this.ctx.fillStyle = '#FFF';
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`Health: ${Math.round(currentPlayer.health)}`, 30, 45);
    
    // 绘制能量值
    this.ctx.fillText(`Energy: ${Math.round(currentPlayer.energy)}`, 30, 70);

    // 绘制玩家数量
    this.ctx.fillText(`Players: ${this.players.size}`, 30, 95);
  }

  // 报告客户端状态（用于一致性检查）
  private reportState(): void {
    const currentPlayer = this.players.get(this.playerId);
    if (currentPlayer) {
      this.webSocketClient.sendClientStateReport(this.playerId, {
        position: currentPlayer.position,
        direction: currentPlayer.direction,
        health: currentPlayer.health,
        energy: currentPlayer.energy,
        isJumping: currentPlayer.isJumping,
        isAttacking: currentPlayer.isAttacking
      });
    }
  }

  // 设置玩家ID
  setPlayerId(playerId: string): void {
    this.playerId = playerId;
  }

  // 设置房间ID
  setRoomId(roomId: string): void {
    this.roomId = roomId;
  }

  // 重置游戏状态
  reset(): void {
    this.players.clear();
    this.isGameStarted = false;
    this.isCountingDown = false;
    this.countdown = 0;
  }

  // 获取玩家数量
  getPlayerCount(): number {
    return this.players.size;
  }
}