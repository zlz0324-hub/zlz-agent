<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { WebSocketClient } from './WebSocketClient';
import { GameStateManager } from './GameStateManager';
import { RoomInfo, WSMessageType, Player } from './types';

// 界面状态
const currentView = ref<'login' | 'roomList' | 'room' | 'game'>('login');
const playerName = ref('');
const playerId = ref('');
const roomId = ref('');
const roomName = ref('');
const currentRoomName = ref(''); // 当前所在房间的名称
const roomList = ref<RoomInfo[]>([]);
const roomPlayers = ref<Player[]>([]);
const countdown = ref(0);
const isCountingDown = ref(false);
const errorMessage = ref('');
const showDisconnectModal = ref(false); // 网络断开提示模态框

// 聊天功能相关
const chatMessages = ref<{playerName: string, message: string, timestamp: number}[]>([]);
const chatInput = ref('');
const showEmojiPicker = ref(false);
// 简单的表情包
const emojis = ['😀', '😂', '😍', '😎', '😢', '😡', '👍', '👎', '❤️', '🎉'];

// WebSocket客户端
let wsClient: WebSocketClient | null = null;
let gameStateManager: GameStateManager | null = null;

// 计算属性
const isInRoom = computed(() => currentView.value === 'room');
const isInGame = computed(() => currentView.value === 'game');

// 初始化WebSocket连接
onMounted(() => {
  // 尝试从localStorage恢复连接信息
  const savedPlayerId = localStorage.getItem('playerId');
  const savedRoomId = localStorage.getItem('roomId');
  const savedRoomName = localStorage.getItem('roomName');
  
  if (savedPlayerId && savedRoomId) {
    playerId.value = savedPlayerId;
    roomId.value = savedRoomId;
    currentRoomName.value = savedRoomName || '';
    // 稍后会尝试重连
  }
});

// 清理资源
onUnmounted(() => {
  if (gameStateManager) {
    gameStateManager.stop();
  }
  if (wsClient) {
    wsClient.disconnect();
  }
});

// 连接WebSocket服务器
function connectWebSocket() {
  // 使用直接URL配置，避免import.meta.env类型问题
  const wsUrl = 'ws://localhost:3001'; // 开发环境默认使用本地服务器
    
  wsClient = new WebSocketClient({
    url: wsUrl,
    reconnectInterval: 1000,
    maxReconnectAttempts: 10,
    heartbeatInterval: 5000
  });

  // 设置WebSocket事件处理
  setupWebSocketHandlers();

  // 连接服务器
  wsClient.connect().then(() => {
    // 连接成功后，设置玩家名称
    if (playerName.value.trim()) {
      // 这里需要发送玩家名称给服务器
      console.log('Player name set:', playerName.value);
    }
  }).catch(error => {
    console.error('Failed to connect:', error);
    errorMessage.value = '无法连接到游戏服务器，请稍后再试';
  });
}

// 设置WebSocket事件处理
function setupWebSocketHandlers() {
  if (!wsClient) return;

  // 连接成功
  wsClient.on(WSMessageType.CONNECT, (message) => {
    const { playerId: newPlayerId } = message.data;
    playerId.value = newPlayerId;
    localStorage.setItem('playerId', newPlayerId);
    
    // 如果有保存的房间ID，尝试重连
    const savedRoomId = localStorage.getItem('roomId');
    if (savedRoomId) {
      roomId.value = savedRoomId;
      wsClient?.reconnect(newPlayerId, savedRoomId);
    } else {
      // 否则显示房间列表
      currentView.value = 'roomList';
      wsClient?.requestRoomList();
    }
  });

  // 房间列表更新
  wsClient.on(WSMessageType.ROOM_LIST, (message) => {
    roomList.value = message.data.rooms;
  });

  // 创建房间成功
  wsClient.on(WSMessageType.CREATE_ROOM, (message) => {
    const { roomId: newRoomId } = message.data;
    roomId.value = newRoomId;
    currentRoomName.value = roomName.value; // 保存创建的房间名称
    localStorage.setItem('roomId', newRoomId);
    localStorage.setItem('roomName', roomName.value); // 保存房间名称到本地
    currentView.value = 'room';
  });

  // 加入房间成功
  wsClient.on(WSMessageType.JOIN_ROOM, (message) => {
    const { roomId: joinedRoomId } = message.data;
    roomId.value = joinedRoomId;
    // 从房间列表中找到对应的房间名称
    const joinedRoom = roomList.value.find(r => r.id === joinedRoomId);
    if (joinedRoom) {
      currentRoomName.value = joinedRoom.name;
      localStorage.setItem('roomName', joinedRoom.name);
    }
    localStorage.setItem('roomId', joinedRoomId);
    currentView.value = 'room';
    roomPlayers.value = message.data.players || [];
  });

  // 玩家加入房间
  wsClient.on(WSMessageType.PLAYER_JOINED, (message) => {
    const newPlayer = message.data.player;
    roomPlayers.value.push(newPlayer);
  });

  // 玩家离开房间
  wsClient.on(WSMessageType.PLAYER_LEFT, (message) => {
    const { playerId } = message.data;
    roomPlayers.value = roomPlayers.value.filter(p => p.id !== playerId);
  });

  // 重连成功
  wsClient.on(WSMessageType.RECONNECT_SUCCESS, (message) => {
    const { roomId: reconnectedRoomId, players, gameStarted } = message.data;
    roomId.value = reconnectedRoomId;
    // 从本地存储恢复房间名称
    currentRoomName.value = localStorage.getItem('roomName') || '';
    roomPlayers.value = players || [];
    showDisconnectModal.value = false; // 隐藏断开连接提示
    
    if (gameStarted) {
      // 如果游戏已经开始，直接进入游戏
      enterGame();
    } else {
      // 否则进入房间等待界面
      currentView.value = 'room';
    }
  });

  // 重连失败
  wsClient.on(WSMessageType.RECONNECT_FAILED, () => {
    localStorage.removeItem('roomId');
    currentView.value = 'roomList';
    wsClient?.requestRoomList();
  });

  // 倒计时开始
  wsClient.on(WSMessageType.COUNTDOWN_START, (message) => {
    isCountingDown.value = true;
    countdown.value = message.data.countdown || 3;
  });

  // 倒计时更新
  wsClient.on(WSMessageType.COUNTDOWN_UPDATE, (message) => {
    countdown.value = message.data.countdown;
  });

  // 倒计时结束，游戏开始
  wsClient.on(WSMessageType.COUNTDOWN_END, () => {
    isCountingDown.value = false;
    enterGame();
  });

  // 错误消息
  wsClient.on(WSMessageType.DISCONNECT, (message) => {
    if (message.data && message.data.error) {
      errorMessage.value = message.data.error;
    }
    // 显示网络断开提示
    showDisconnectModal.value = true;
  });

  // 接收聊天消息
  wsClient.on('chat_message', (message) => {
    const { playerName, text, timestamp } = message.data;
    chatMessages.value.push({
      playerName,
      message: text,
      timestamp
    });
    // 自动滚动到最新消息
    setTimeout(() => {
      const chatContainer = document.getElementById('chat-messages-container');
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 0);
  });
}

// 开始游戏
function enterGame() {
  currentView.value = 'game';
  
  // 初始化游戏状态管理器
  setTimeout(() => {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (canvas && wsClient) {
      // 设置画布大小
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // 创建游戏状态管理器
      gameStateManager = new GameStateManager({
        webSocketClient: wsClient,
        canvas,
        playerId: playerId.value,
        renderInterval: 16,
        stateReportInterval: 500
      });

      gameStateManager.setPlayerId(playerId.value);
      gameStateManager.setRoomId(roomId.value);
      gameStateManager.start();
    }
  }, 100);
}

// 处理登录
function handleLogin() {
  if (!playerName.value.trim()) {
    errorMessage.value = '请输入玩家名称';
    return;
  }

  errorMessage.value = '';
  connectWebSocket();
}

// 创建房间
function createRoom() {
  if (!roomName.value.trim()) {
    errorMessage.value = '请输入房间名称';
    return;
  }

  errorMessage.value = '';
  wsClient?.createRoom(roomName.value);
  roomName.value = '';
}

// 加入房间
function joinRoom(roomId: string) {
  wsClient?.joinRoom(roomId);
}

// 离开房间
function leaveRoom() {
  wsClient?.leaveRoom();
  localStorage.removeItem('roomId');
  localStorage.removeItem('roomName');
  roomId.value = '';
  currentRoomName.value = '';
  roomPlayers.value = [];
  chatMessages.value = []; // 清空聊天记录
  currentView.value = 'roomList';
  wsClient?.requestRoomList();
}

// 发送聊天消息
function sendChatMessage() {
  if (!chatInput.value.trim() || !wsClient) return;
  
  const messageText = chatInput.value.trim();
  // 发送消息到服务器
  wsClient.send({
    type: 'chat_message',
    data: {
      text: messageText,
      roomId: roomId.value,
      playerId: playerId.value,
      timestamp: Date.now()
    },
    timestamp: Date.now()
  });
  
  chatInput.value = '';
  showEmojiPicker.value = false;
}

// 添加表情到聊天输入框
function addEmoji(emoji: string) {
  chatInput.value += emoji;
  showEmojiPicker.value = false;
}

// 返回房间列表
function backToRoomList() {
  currentView.value = 'roomList';
  wsClient?.requestRoomList();
}

// 退出游戏
function exitGame() {
  if (gameStateManager) {
    gameStateManager.stop();
    gameStateManager = null;
  }
  leaveRoom();
}

// 窗口大小改变处理
function handleResize() {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
}

// 添加窗口大小改变监听器
onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<template>
  <div class="app-container">
    <!-- 登录界面 -->
    <div v-if="currentView === 'login'" class="login-container transition-view">
      <h1>实时对战游戏</h1>
      <div class="login-form">
        <input 
          v-model="playerName" 
          type="text" 
          placeholder="请输入您的玩家名称"
          maxlength="20"
          @keyup.enter="handleLogin"
        />
        <button @click="handleLogin" class="primary-button">进入游戏</button>
        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
      </div>
    </div>

    <!-- 房间列表界面 -->
    <div v-else-if="currentView === 'roomList'" class="room-list-container transition-view">
      <h1>房间列表</h1>
      
      <div class="create-room-form">
        <input 
          v-model="roomName" 
          type="text" 
          placeholder="房间名称"
          maxlength="30"
        />
        <button @click="createRoom" class="primary-button">创建房间</button>
      </div>

      <div v-if="roomList.length > 0" class="room-list">
        <div 
          v-for="room in roomList" 
          :key="room.id" 
          class="room-item"
          :class="{ 'room-full': room.playerCount >= room.maxPlayers }"
        >
          <div class="room-info">
            <h3>{{ room.name }}</h3>
            <p>{{ room.playerCount }}/{{ room.maxPlayers }} 玩家</p>
          </div>
          <button 
            @click="joinRoom(room.id)" 
            class="secondary-button"
            :disabled="room.playerCount >= room.maxPlayers || room.gameStarted"
          >
            {{ room.playerCount >= room.maxPlayers ? '已满' : room.gameStarted ? '游戏中' : '加入' }}
          </button>
        </div>
      </div>
      <div v-else class="empty-message">
        暂无可用房间，请创建一个新房间
      </div>
      
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </div>

    <!-- 房间等待界面 -->
    <div v-else-if="currentView === 'room'" class="room-container transition-view">
      <div class="room-header">
        <h1>房间: {{ currentRoomName }}</h1>
        <button @click="leaveRoom" class="danger-button">离开房间</button>
      </div>

      <div v-if="isCountingDown" class="countdown-container">
        <h2>游戏即将开始</h2>
        <div class="countdown-number">{{ countdown }}</div>
      </div>

      <div v-else class="players-list">
        <h2>玩家列表</h2>
        <div v-for="player in roomPlayers" :key="player.id" class="player-item">
          <span :class="{ 'local-player': player.id === playerId }">{{ player.name }}</span>
          <span v-if="player.id === playerId" class="local-badge">(你)</span>
        </div>
        <p class="room-info-text">房间人数达到2人时自动开始倒计时</p>
      </div>

      <!-- 聊天功能 -->
      <div class="chat-container">
        <h3>聊天</h3>
        <div id="chat-messages-container" class="chat-messages">
          <div v-for="(msg, index) in chatMessages" :key="index" class="chat-message">
            <span class="chat-player-name">{{ msg.playerName }}:</span>
            <span class="chat-text">{{ msg.message }}</span>
          </div>
        </div>
        <div class="chat-input-container">
          <button @click="showEmojiPicker = !showEmojiPicker" class="emoji-button">😊</button>
          <input 
            v-model="chatInput" 
            type="text" 
            placeholder="输入消息..."
            maxlength="200"
            @keyup.enter="sendChatMessage"
          />
          <button @click="sendChatMessage" class="send-button">发送</button>
          <!-- 表情选择器 -->
          <div v-if="showEmojiPicker" class="emoji-picker">
            <span 
              v-for="emoji in emojis" 
              :key="emoji" 
              @click="addEmoji(emoji)"
              class="emoji-item"
            >
              {{ emoji }}
            </span>
          </div>
        </div>
      </div>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </div>

    <!-- 游戏界面 -->
    <div v-else-if="currentView === 'game'" class="game-container transition-view">
      <canvas id="gameCanvas"></canvas>
      <div class="game-ui">
        <button @click="exitGame" class="exit-button">退出游戏</button>
        <div class="controls-hint">
          <p>移动: WASD 或 方向键</p>
          <p>攻击: J 或 Z</p>
          <p>跳跃: 空格键</p>
        </div>
      </div>
    </div>
  </div>

  <!-- 网络断开提示模态框 -->
  <div v-if="showDisconnectModal" class="modal-overlay">
    <div class="modal-content">
      <h2>网络连接断开</h2>
      <p>正在尝试重新连接...</p>
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #0f0f1a;
  color: #ffffff;
  overflow: hidden;
}

.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

/* 登录界面样式 */
.login-container {
  text-align: center;
  max-width: 400px;
  width: 100%;
}

.login-container h1 {
  font-size: 2.5rem;
  margin-bottom: 2rem;
  color: #4CAF50;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.login-form input {
  padding: 1rem;
  font-size: 1rem;
  border: 2px solid #333;
  border-radius: 8px;
  background-color: #1a1a2e;
  color: #fff;
  outline: none;
  transition: border-color 0.3s;
}

.login-form input:focus {
  border-color: #4CAF50;
}

/* 按钮样式 */
.primary-button, .secondary-button, .danger-button {
  padding: 1rem 2rem;
  font-size: 1rem;
  font-weight: bold;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.primary-button {
  background-color: #4CAF50;
  color: white;
}

.primary-button:hover {
  background-color: #45a049;
  transform: translateY(-2px);
}

.secondary-button {
  background-color: #2196F3;
  color: white;
}

.secondary-button:hover:not(:disabled) {
  background-color: #1976D2;
  transform: translateY(-2px);
}

.secondary-button:disabled {
  background-color: #666;
  cursor: not-allowed;
  transform: none;
}

.danger-button {
  background-color: #f44336;
  color: white;
}

.danger-button:hover {
  background-color: #d32f2f;
  transform: translateY(-2px);
}

.error-message {
  color: #f44336;
  margin-top: 1rem;
}

/* 房间列表样式 */
.room-list-container {
  width: 100%;
  max-width: 800px;
  height: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.room-list-container h1 {
  font-size: 2rem;
  color: #2196F3;
  text-align: center;
}

.create-room-form {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.create-room-form input {
  flex: 1;
  padding: 0.8rem;
  font-size: 1rem;
  border: 2px solid #333;
  border-radius: 8px;
  background-color: #1a1a2e;
  color: #fff;
  outline: none;
}

.create-room-form input:focus {
  border-color: #2196F3;
}

.room-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-right: 0.5rem;
}

.room-item {
  background-color: #1a1a2e;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.3s;
}

.room-item:hover {
  border-color: #2196F3;
  transform: translateX(5px);
}

.room-item.room-full {
  opacity: 0.6;
}

.room-info h3 {
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
}

.room-info p {
  color: #aaa;
}

.empty-message {
  text-align: center;
  color: #aaa;
  padding: 2rem;
  font-size: 1.1rem;
}

/* 房间等待界面样式 */
.room-container {
  width: 100%;
  max-width: 600px;
  height: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.room-header h1 {
  font-size: 2rem;
  color: #2196F3;
}

.players-list h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: #4CAF50;
}

.player-item {
  background-color: #1a1a2e;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.local-player {
  font-weight: bold;
  color: #4CAF50;
}

.local-badge {
  color: #4CAF50;
  font-size: 0.9rem;
}

.room-info-text {
  color: #aaa;
  font-style: italic;
}

/* 倒计时样式 */
.countdown-container {
  text-align: center;
  margin: 2rem 0;
}

.countdown-container h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
}

.countdown-number {
  font-size: 5rem;
  font-weight: bold;
  color: #FFC107;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

/* 游戏界面样式 */
.game-container {
  position: relative;
  width: 100vw;
  height: 100vh;
}

#gameCanvas {
  display: block;
  width: 100%;
  height: 100%;
}

.game-ui {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.exit-button {
  position: absolute;
  top: 20px;
  right: 20px;
  background-color: #f44336;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  font-size: 1rem;
  cursor: pointer;
  pointer-events: all;
  transition: background-color 0.3s;
}

.exit-button:hover {
  background-color: #d32f2f;
}

.controls-hint {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background-color: rgba(0, 0, 0, 0.7);
  padding: 10px;
  border-radius: 5px;
  font-size: 0.9rem;
  pointer-events: none;
}

.controls-hint p {
  margin: 3px 0;
}

/* 页面过渡动画 */
.transition-view {
  animation: fadeIn 0.5s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 模态框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease-in-out;
}

.modal-content {
  background-color: #1a1a2e;
  padding: 2rem;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  animation: slideIn 0.3s ease-in-out;
}

.modal-content h2 {
  color: #f44336;
  margin-bottom: 1rem;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 聊天功能样式 */
.chat-container {
  margin-top: 2rem;
  background-color: #1a1a2e;
  border-radius: 8px;
  padding: 1rem;
  height: 200px;
  display: flex;
  flex-direction: column;
}

.chat-container h3 {
  color: #2196F3;
  margin-bottom: 0.5rem;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  background-color: #0f0f1a;
  border-radius: 5px;
}

.chat-message {
  margin-bottom: 0.5rem;
  display: flex;
}

.chat-player-name {
  font-weight: bold;
  color: #4CAF50;
  margin-right: 0.5rem;
}

.chat-text {
  color: #fff;
}

.chat-input-container {
  display: flex;
  gap: 0.5rem;
  position: relative;
}

.chat-input-container input {
  flex: 1;
  padding: 0.5rem;
  border: 2px solid #333;
  border-radius: 5px;
  background-color: #0f0f1a;
  color: #fff;
  outline: none;
}

.chat-input-container input:focus {
  border-color: #2196F3;
}

.emoji-button {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 5px;
  transition: background-color 0.3s;
}

.emoji-button:hover {
  background-color: #333;
}

.send-button {
  padding: 0.5rem 1rem;
  background-color: #2196F3;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.send-button:hover {
  background-color: #1976D2;
}

.emoji-picker {
  position: absolute;
  bottom: 100%;
  left: 0;
  background-color: #1a1a2e;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  width: 200px;
  z-index: 10;
}

.emoji-item {
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.2rem;
  border-radius: 5px;
  transition: background-color 0.3s;
}

.emoji-item:hover {
  background-color: #333;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .app-container {
    padding: 10px;
  }
  
  .login-container h1,
  .room-list-container h1,
  .room-header h1 {
    font-size: 1.8rem;
  }
  
  .create-room-form {
    flex-direction: column;
  }
  
  .room-item {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }
  
  .room-info {
    width: 100%;
  }
  
  .room-header {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }
  
  .controls-hint {
    font-size: 0.8rem;
    bottom: 10px;
    left: 10px;
  }
  
  /* 聊天功能响应式 */
  .chat-container {
    height: 150px;
  }
  
  .chat-input-container {
    flex-wrap: wrap;
  }
  
  .emoji-picker {
    width: 100%;
    left: 50%;
    transform: translateX(-50%);
  }
}
</style>