import express from 'express';
import WebSocket from 'ws';
import http from 'http';
import { Server } from 'ws';

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3001;

// 创建HTTP服务器
const server = http.createServer(app);

// 创建WebSocket服务器
const wss = new Server({ server });

// 处理WebSocket连接
wss.on('connection', (ws: WebSocket) => {
  console.log('新用户连接');

  // 监听消息
  ws.on('message', (message: string) => {
    console.log('收到消息:', message);
    // 广播消息给所有客户端
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  // 监听连接关闭
  ws.on('close', () => {
    console.log('用户断开连接');
  });
});

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