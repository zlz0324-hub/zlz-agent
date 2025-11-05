import { WSMessage, PlayerInput } from './types';
import WebSocket from 'ws';

interface MessageQueueItem {
  message: WSMessage;
  recipientId: string;
  timestamp: number;
  priority: number;
}

export class MessageOptimizer {
  private messageQueue: MessageQueueItem[] = [];
  private processingInterval: NodeJS.Timeout | null = null;
  private maxQueueSize: number = 1000;
  private processingRate: number = 8; // 每秒处理8次，约125ms一次
  private inputBuffer: Map<string, PlayerInput[]> = new Map();
  private inputBufferingTime: number = 10; // 10ms的输入缓冲

  constructor() {
    // 开始处理消息队列
    this.startProcessing();
  }

  // 添加消息到队列
  addMessage(message: WSMessage, recipientId: string, priority: number = 0): void {
    if (this.messageQueue.length >= this.maxQueueSize) {
      // 如果队列已满，移除优先级最低的消息
      this.removeLowPriorityMessages();
    }

    this.messageQueue.push({
      message,
      recipientId,
      timestamp: Date.now(),
      priority
    });

    // 根据优先级排序
    this.messageQueue.sort((a, b) => b.priority - a.priority);
  }

  // 添加玩家输入到缓冲
  addPlayerInput(input: PlayerInput): void {
    const playerId = input.id;
    if (!this.inputBuffer.has(playerId)) {
      this.inputBuffer.set(playerId, []);
    }
    
    const buffer = this.inputBuffer.get(playerId)!;
    buffer.push(input);
    
    // 如果这是该玩家的第一个输入，设置定时器来处理缓冲
    if (buffer.length === 1) {
      setTimeout(() => {
        this.processInputBuffer(playerId);
      }, this.inputBufferingTime);
    }
  }

  // 处理玩家输入缓冲
  private processInputBuffer(playerId: string): void {
    const buffer = this.inputBuffer.get(playerId);
    if (!buffer || buffer.length === 0) return;

    // 合并输入，只保留最新状态并清除缓冲
    // 注意：该方法内部处理缓冲，不需要返回值
    this.inputBuffer.delete(playerId);
  }

  // 移除低优先级消息
  private removeLowPriorityMessages(): void {
    // 只保留优先级最高的50%消息
    const keepCount = Math.floor(this.maxQueueSize * 0.5);
    this.messageQueue = this.messageQueue.slice(0, keepCount);
  }

  // 开始定期处理消息队列
  private startProcessing(): void {
    if (this.processingInterval) return;

    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 1000 / this.processingRate);
  }

  // 处理消息队列
  private processQueue(): void {
    const currentTime = Date.now();
    const messagesToProcess = this.messageQueue.filter(msg => {
      // 丢弃超时消息（超过500ms的消息不再处理）
      return currentTime - msg.timestamp < 500;
    });

    // 清空队列并只保留未超时消息
    this.messageQueue = [];
    
    // 这里应该将消息发送给相应的客户端
    // 实际发送逻辑会在主文件中实现
    // 这里只是优化消息处理流程
  }

  // 获取队列状态（用于监控）
  getQueueStatus(): {
    queueSize: number;
    averageDelay: number;
  } {
    const currentTime = Date.now();
    let totalDelay = 0;
    
    this.messageQueue.forEach(msg => {
      totalDelay += currentTime - msg.timestamp;
    });

    return {
      queueSize: this.messageQueue.length,
      averageDelay: this.messageQueue.length > 0 ? totalDelay / this.messageQueue.length : 0
    };
  }

  // 停止消息处理
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.messageQueue = [];
    this.inputBuffer.clear();
  }
}

// 创建单例实例
let messageOptimizerInstance: MessageOptimizer | null = null;

export function getMessageOptimizer(): MessageOptimizer {
  if (!messageOptimizerInstance) {
    messageOptimizerInstance = new MessageOptimizer();
  }
  return messageOptimizerInstance;
}