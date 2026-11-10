# 当前任务

## [未完成] 2026-11-10 23:40 把 IteraCompute 加进 magpie（备用）

前提：qi 已在图形界面设好环境变量 ITERACOMPUTE_API_KEY。没设就先停下，报告里写「缺密钥」。

1. 接口信息
   - 地址：https://api.iteracompute.com/v1（OpenAI 兼容）
   - 密钥：只从环境变量 ITERACOMPUTE_API_KEY 读，不写进任何文件、不打印、不提交。
   - 免费：Qwen3.8-27B 每月 3000 万 tokens，128K 上下文，单次输出上限 8192，用完返回 429（不扣钱）。活动到 2026-11-24 16:00（北京时间）。
   - 限制：同一账号同时只跑 1 个请求，会排队。
2. 先调 GET /v1/models 确认 model id（应为 qwen/qwen3.8-27b，另有 Auto），各发一条「你好」测试，记录成功与否、响应时间。
3. 加进 magpie（http://127.0.0.1:3425/v1）
   - 新增供应商 iteracompute，注册模型名 qwen3.8-27b。
   - 不进 GLM 路由组；单独作为 Qwen 备用。
   - 429 或排队超时（60 秒）就跳过，不卡死。
4. 不改其他供应商配置。
5. 写报告到 reports/，推 qoder-inbox，回一句「已推收件箱」。

## [待确认] 英伟达 NIM 接入（23:24 在聊天里发过的卡）
如果已经做了，报告里写结果；没做，等 qi 设好 NVIDIA_API_KEY 后照那张卡做。
