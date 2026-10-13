# 奇妙口袋事务所

原创童年治愈互动 Web 产品：写下一个小烦恼，翻找口袋，遇见一件带点乌龙的奇妙道具。前端使用 Vue 3 + Vite，后端使用 Node.js 24 + SQLite。

在线体验：**[xiaoming96.github.io/baibaodai](https://xiaoming96.github.io/baibaodai/)**。

GitHub Pages 提供静态游客体验。登录、云同步、AI、支付和配送的服务端代码已实现并有测试覆盖；目前没有配置正式后端主机和真实供应商账号，因此不能把公开网页视为已开通云服务或可完成真实交易的网站。未开放的入口会说明状态，基础玩法继续可用。

## 现在可以体验什么

- **烦恼求助**：100 字输入、3 秒翻找、10 种原创杂物、16 件基础道具与原创 SVG 插画；通过连续力度滑块探索四类结局、临场事件和连锁补救。
- **轻量收集**：每日盲盒、道具合体、三类收藏、心选筛选、最近 30 次奇遇、耐久恢复、免费修理和成功分享后的修理奖励。
- **随身留念**：三种可编辑明信片模板，PNG 保存与浏览器原生文件分享；账户页可导出、合并导入游客收藏备份。
- **更多入口**：可以浏览月卡、小物和节日限定预览，在脑洞投稿箱保存本地草稿。真实购买、公共投稿和登录按后端能力开放，不会模拟付款成功或短信送达。
- **离线访问**：生产版本通过 HTTPS 或本机访问并完成基础资源缓存后，可离线重新打开游客玩法。音效默认关闭，界面适配手机并尊重减少动态效果设置。

完整的功能、代码位置、测试与生产接入状态见 **[功能说明](docs/FEATURES.md)**；后端部署和供应商协议见 **[部署与服务接入](docs/DEPLOYMENT.md)**。

## 本地开发

需要 **Node.js 24+**。后端使用该版本内置的 `node:sqlite`；安装依赖使用仓库锁文件。

```bash
npm ci --cache /tmp/baibaodai-npm-cache --no-audit --no-fund
```

终端一启动后端：

```bash
npm run server
```

终端二启动前端：

```bash
npm run dev -- --port 5173
```

打开 `http://localhost:5173`。开发模式在 localhost 或 127.0.0.1 自动连接同一主机的 3001 端口；也可通过公开的 `VITE_API_BASE_URL` 指定后端。空服务配置允许后端启动和健康检查，但短信、微信、AI、支付、供应链保持关闭。需要这些能力时，按 [部署文档](docs/DEPLOYMENT.md) 配置运营方自己的服务。

后端默认把用户、玩法状态、订单、投稿和统计保存到 `data/pocket.sqlite`。玩法状态以 JSON 保存于 SQLite 表中；部署时应使用持久磁盘或 Docker 数据卷。

```bash
curl --fail http://localhost:3001/api/health
curl --fail http://localhost:3001/api/config
```

## 构建与验证

```bash
npm test
npm run build
npm run preview -- --port 4173
```

`npm test` 覆盖玩法、存档与迁移、API 客户端、真实 HTTP/SQLite、OTP 与会话、AI 输出校验、订单与签名通知、UGC 审核和匿名统计。供应商相关测试使用受控适配器，验证业务行为与失败路径；不代表真实供应商账号已经开通。

安装 Python Playwright 和 Chromium 后，可运行浏览器回归：

```bash
# 先运行本地前端和后端，验证游客完整流程。
python tests/smoke.py

# 先运行前端，验证心选、备份、历史、投稿草稿和商业能力关闭时的行为。
python tests/features-smoke.py

# 自行启动并停止隔离的测试后端与 Vite，验证登录和云端流程。
python tests/cloud-smoke.py
```

`cloud-smoke.py` 的短信适配器只属于测试夹具，不发送真实短信，也不是生产开发验证码入口；它不调用真实 AI、支付或配送供应商。测试产物分别保存于 `/tmp/pocket-smoke/` 和 `/tmp/pocket-cloud-smoke/`。

生产离线验证需要先运行上述 preview：

```bash
POCKET_TEST_URL=http://127.0.0.1:4173 POCKET_TEST_OFFLINE=1 python tests/smoke.py
```

仓库也提供已验证可构建、启动并通过健康检查的 [Dockerfile](Dockerfile) 和 [Compose](compose.yaml)。具体运行、持久存储和 HTTPS 配置见 [部署文档](docs/DEPLOYMENT.md#2-docker-后端)。

## GitHub Pages 与正式后端

[Pages 工作流](.github/workflows/pages.yml) 使用 Node.js 24，执行安装、测试、构建和部署。仓库 Pages 的 Source 设为 **GitHub Actions**；推送 `main` 或手动运行工作流即可发布。构建使用 `VITE_BASE_PATH=/baibaodai/`，资源和离线缓存适配仓库子路径。

`VITE_API_BASE_URL` 是可选的 GitHub Actions **仓库变量**。留空时生产构建保持本地游客模式；部署真实 HTTPS 后端后再填写其 origin，并重新构建。不要填 `/api` 路径，也不要把密钥放入任何 `VITE_` 变量。CORS、微信回调、支付通知和供应商接入方式统一见 [部署文档](docs/DEPLOYMENT.md#3-连接-github-pages)。

## 数据与玩法约定

游客存档留在当前浏览器，可在账户页备份。清除网站数据会清空本地记录。游客收藏与登录账户的数据分别保存；登录或向账户导入时，仅上传可校验的基础目录收藏、心选、偏好和历史摘要。游客自行合体的道具继续保留在独立游客存档及本地导出的备份里，不会被当作云端自定义道具或付费权益导入。

原 PRD 作死区 `10 / 20 / 70 / 10` 合计 110，本版保留比例并归一化，约为 `9.09% / 18.18% / 63.64% / 9.09%`。每日额度、修理、会员和三组年度节日窗口的明确规则见 [功能说明](docs/FEATURES.md#玩法规则与数据边界)。
