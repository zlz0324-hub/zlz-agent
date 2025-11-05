<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

// WebSocket连接状态
const isConnected = ref(false);
const ws = ref<WebSocket | null>(null);
const messages = ref<string[]>([]);
const inputMessage = ref('');
const connectionStatus = ref('未连接');

// 连接WebSocket
const connectWebSocket = () => {
  try {
    // 连接到WebSocket服务器
    ws.value = new WebSocket('ws://localhost:3001');
    
    ws.value.onopen = () => {
      console.log('WebSocket连接已建立');
      isConnected.value = true;
      connectionStatus.value = '已连接';
      messages.value.push('连接到服务器成功');
    };
    
    ws.value.onmessage = (event) => {
      console.log('收到消息:', event.data);
      messages.value.push(event.data);
    };
    
    ws.value.onclose = () => {
      console.log('WebSocket连接已关闭');
      isConnected.value = false;
      connectionStatus.value = '已断开';
      messages.value.push('与服务器断开连接');
    };
    
    ws.value.onerror = (error) => {
      console.error('WebSocket错误:', error);
      isConnected.value = false;
      connectionStatus.value = '连接错误';
      messages.value.push('连接出错，请检查服务器状态');
    };
  } catch (error) {
    console.error('连接WebSocket失败:', error);
    connectionStatus.value = '连接失败';
  }
};

// 发送消息
const sendMessage = () => {
  if (ws.value && isConnected.value && inputMessage.value.trim()) {
    ws.value.send(inputMessage.value);
    inputMessage.value = '';
  }
};

// 断开连接
const disconnectWebSocket = () => {
  if (ws.value) {
    ws.value.close();
    ws.value = null;
  }
};

// 组件挂载时连接
onMounted(() => {
  connectWebSocket();
});

// 组件卸载时断开连接
onUnmounted(() => {
  disconnectWebSocket();
});
</script>

<template>
  <div class="app">
    <h1>多人同步游戏演示</h1>
    
    <div class="connection-status" :class="{ 'connected': isConnected }">
      <span>WebSocket状态: {{ connectionStatus }}</span>
      <button @click="connectWebSocket" v-if="!isConnected">重新连接</button>
      <button @click="disconnectWebSocket" v-else>断开连接</button>
    </div>
    
    <div class="chat-container">
      <div class="messages">
        <div v-for="(msg, index) in messages" :key="index" class="message">
          {{ msg }}
        </div>
      </div>
      
      <div class="input-area">
        <input 
          v-model="inputMessage" 
          @keyup.enter="sendMessage" 
          placeholder="输入消息..." 
          :disabled="!isConnected"
        />
        <button @click="sendMessage" :disabled="!isConnected || !inputMessage.trim()">
          发送
        </button>
      </div>
    </div>
    
    <div class="info">
      <p>这是一个多人同步游戏的基础框架演示</p>
      <p>后端WebSocket服务已就绪，可以进行实时通信测试</p>
    </div>
  </div>
</template>

<style>
.app {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

h1 {
  text-align: center;
  color: #333;
}

.connection-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  margin-bottom: 20px;
  background-color: #f5f5f5;
  border-radius: 5px;
}

.connection-status.connected {
  background-color: #e6f7e6;
  color: #388e3c;
}

.connection-status button {
  padding: 5px 10px;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.connection-status button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.chat-container {
  border: 1px solid #ddd;
  border-radius: 5px;
  overflow: hidden;
  margin-bottom: 20px;
}

.messages {
  height: 300px;
  overflow-y: auto;
  padding: 10px;
  background-color: #fafafa;
}

.message {
  margin-bottom: 10px;
  padding: 5px 10px;
  background-color: white;
  border-radius: 3px;
  border-left: 3px solid #2196f3;
}

.input-area {
  display: flex;
  padding: 10px;
  background-color: white;
  border-top: 1px solid #ddd;
}

.input-area input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 3px 0 0 3px;
  outline: none;
}

.input-area input:focus {
  border-color: #2196f3;
}

.input-area button {
  padding: 8px 15px;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 0 3px 3px 0;
  cursor: pointer;
}

.input-area button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.info {
  text-align: center;
  color: #666;
  font-size: 14px;
}
</style>