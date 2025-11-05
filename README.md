# 多人同步游戏基础框架

基于 Node.js + TypeScript + Vue3 + Vite 的前后端分离多人同步游戏项目框架。

## 项目结构

```
├── server/          # 后端服务（Node.js + TypeScript + WebSocket）
├── client/          # 前端应用（Vue3 + Vite + TypeScript）
├── package.json     # 项目配置和脚本
└── README.md        # 项目说明文档
```

## 技术栈

### 后端
- Node.js
- TypeScript
- Express
- WebSocket (ws)

### 前端
- Vue 3
- Vite
- TypeScript

## 开发工具
- ESLint
- Prettier
- Husky (Git hooks)

## 快速开始

### 安装依赖

```bash
# 安装根目录依赖
npm install

# 或者使用工作区方式安装所有依赖
npm install
```

### 开发模式

#### 启动后端服务

```bash
npm run dev:server
# 服务将运行在 http://localhost:3001
```

#### 启动前端服务

```bash
npm run dev:client
# 服务将运行在 http://localhost:3000
```

### 构建项目

```bash
# 构建所有项目
npm run build

# 仅构建后端
npm run build:server

# 仅构建前端
npm run build:client
```

### 代码规范检查

```bash
# 检查所有代码
npm run lint
```

## 项目说明

- 后端提供了基础的WebSocket服务器，用于处理实时通信
- 前端实现了WebSocket连接和消息收发的基础功能
- 该框架可作为多人同步游戏的起点，您可以在此基础上实现具体的游戏逻辑

## 注意事项

- 确保Node.js版本 >= 16.x
- 开发环境中，前端通过WebSocket直接连接后端的3001端口