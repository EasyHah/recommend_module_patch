# Appflow Chat SDK 独立测试页面使用指南

## 🎯 页面位置
`appflow-test-standalone.html` - 项目根目录下的独立测试页面

## 🚀 如何使用

### 1. 打开测试页面
直接在浏览器中打开 `appflow-test-standalone.html` 文件，或者通过本地服务器访问。

### 2. 配置信息
- **Integrate ID**: 你的集成ID，格式如 `cit-44fd57644e264fecabe0`
- **Request Domain**: 你的请求域名，格式如 `https://xxxxx.appflow.aliyunnest.com`

### 3. 测试步骤
1. **填写配置**: 在页面顶部输入框中填写你的 integrateId 和 requestDomain
2. **初始化 SDK**: 点击"🚀 初始化 SDK"按钮
3. **显示聊天窗口**: 初始化成功后，点击"💬 显示聊天窗口"
4. **发送测试消息**: 点击"📤 发送测试消息"测试消息发送功能

### 4. 调试功能
- **获取 SDK 信息**: 查看 SDK 加载状态和可用方法
- **实时日志**: 页面底部显示详细的操作日志
- **清空日志**: 清理日志区域

## 🔍 错误排查

### 常见错误类型

#### 1. 400 (Bad Request) 错误
**症状**: POST 请求返回 400 状态码
**原因**:
- integrateId 不存在、未发布或不属于当前域名
- requestDomain 与集成环境不匹配
- 测试域名已过期（30天有效期）
- 缺少必要的鉴权参数

**解决方案**:
1. 登录 [AppFlow 控制台](https://appflow.console.aliyun.com/)
2. 检查 AI助手 → 集成 → Web集成
3. 确认集成已"发布"且状态正常
4. 复制最新的集成ID和域名
5. 如使用测试域名，检查是否过期，考虑绑定自定义域名

#### 2. ReadableStream 锁定错误
**症状**: `Failed to execute 'getReader' on 'ReadableStream'`
**原因**: 通常是 400 错误的连带症状，SDK 尝试读取无效响应流
**解决方案**: 先解决 400 错误，ReadableStream 错误会自动消失

#### 3. CORS 跨域错误
**症状**: `Access to fetch at ... has been blocked by CORS policy`
**原因**: 
- 当前访问地址未加入域名白名单
- 测试域名限制或过期

**解决方案**:
1. 在 AppFlow 控制台的集成设置中添加当前域名到白名单
2. 如本地测试，可能需要添加 `http://localhost` 或具体端口
3. 使用生产环境的自定义域名

#### 4. SDK 脚本加载失败
**症状**: `SDK 脚本未加载`
**原因**: 网络问题或 CDN 不可访问
**解决方案**: 
1. 检查网络连接
2. 尝试直接访问 `https://o.alicdn.com/appflow/chatbot/v1/AppflowChatSDK.js`
3. 如果无法访问，联系阿里云技术支持

## 📊 调试技巧

### 1. 浏览器开发者工具
- **Network 面板**: 查看具体的请求和响应，特别是 400 错误的响应体
- **Console 面板**: 查看详细的错误堆栈和日志
- **Application 面板**: 检查是否有存储相关问题

### 2. 页面日志分析
- **绿色 ✅**: 操作成功
- **红色 ❌**: 错误信息，需要处理
- **黄色 ⚠️**: 警告信息，可能需要注意
- **蓝色 ℹ️**: 一般信息

### 3. 对比测试
1. **最小化测试**: 使用此独立页面排除项目其他代码影响
2. **官方示例对比**: 与 AppFlow 控制台提供的示例脚本进行对比
3. **环境对比**: 在不同浏览器或网络环境下测试

## 🛠️ 高级调试

### 手动测试 API
如果页面测试仍有问题，可以用 Postman 或 curl 直接测试 API：

```bash
curl -X POST https://你的域名.appflow.aliyunnest.com/webhook/chatbot/chat/你的integrateId \
  -H "Content-Type: application/json" \
  -d '{"message": "测试消息"}'
```

### 检查网络请求
在 Network 面板中找到失败的请求，查看：
- **Request Headers**: 确认请求头是否正确
- **Request Payload**: 确认请求体格式
- **Response**: 查看服务端返回的具体错误信息

## 📞 获取帮助

如果遇到问题：
1. 先查看页面日志和浏览器控制台
2. 截图 Network 面板中失败请求的详细信息
3. 记录具体的错误信息和复现步骤
4. 联系技术支持时提供上述信息

## 🎉 成功标志

当一切正常工作时，你应该看到：
- ✅ SDK 初始化成功
- 🤖 页面右下角出现聊天悬浮窗
- 💬 能够正常发送和接收消息
- 📊 日志中没有红色错误信息

这个独立测试页面帮助你快速定位是配置问题还是集成问题，确保 Appflow Chat SDK 在最简环境下能正常工作。