# 腾讯云 LKE 接入最小方案（本地联调）

## 1. 填写配置

- 复制 `.env.example` 为 `.env.local`，并填入：
  - VITE_LKE_ACCESS_TYPE=ws
  - VITE_LKE_APP_KEY=你的 appkey
  - VITE_LKE_BOT_ID=你的 botbizid
  - （可选）VITE_LKE_TOKEN_ENDPOINT=http://localhost:3000/getDemoToken
- 在系统环境变量（或 PowerShell 启动时设置）中提供后端变量：
  - SECRET_ID=你的 SecretId
  - SECRET_KEY=你的 SecretKey
  - SERVER_PORT=3000

注意：SECRET_KEY 切勿提交到仓库。

## 2. 启动本地鉴权服务

- 运行 npm 脚本：`npm run lke:server`
- 访问 `http://localhost:3000/health` 应返回 `{ ok: true }`
- 访问 `http://localhost:3000/getDemoToken` 应返回 `{ code:0, token:"..." }`

当前示例返回的是“假 token”，可用于前端联通性验证；上线需替换为真实云 API 调用。

## 3. 前端接入

- 在代码中使用 `useLKEChat`：
  - `initialize()` 会请求 `/getDemoToken`
  - 后续将基于 ws/sse 建立连接（留有 TODO）

## 4. 与腾讯云文档对照

- 必填项：APP_KEY、BOT_ID、ACCESS_TYPE
- 后端：提供 `/getDemoToken` 并正确设置 CORS
- 前端：选择 ws 或 sse，监听 reply/thought/token_stat/reference

## 5. 常见问题

- 400：通常为来源域名未绑定或 appkey/botbizid 不匹配
- CORS：确认后端已设置 `Access-Control-Allow-Origin`
- HTTPS：生产建议全链路 HTTPS
