# 奇妙口袋事务所部署与服务接入

代码包含可离线使用的 Vue 前端和 Node.js 后端。GitHub Pages 只运行静态前端；登录、云端同步、AI、支付、周边订单需要一个实际的 HTTPS 后端地址及对应服务账号。仓库没有创建云服务器或第三方账号，也没有预置任何密钥。

不配置后端时，网站继续提供游客玩法、收藏、历史记录和海报导出。部署后端但保持第三方配置为空时，`GET /api/config` 会公开各服务的可用状态；短信、微信、文本 AI、插画、支付与供应链能力保持关闭。接口不会模拟短信送达、支付成功或商品发货。

## 1. 运行方式

后端需要 **Node.js 24**，使用内置 `node:sqlite`，没有额外运行时 npm 依赖。Vue/Vite 的 npm 依赖用于前端开发和构建。

```bash
cp .env.example .env
node --env-file=.env server/index.js
```

在另一个终端检查公开接口：

```bash
curl --fail http://127.0.0.1:3001/api/health
curl --fail http://127.0.0.1:3001/api/config
```

健康接口应返回 `ok: true`、`status: "ok"`、`database: "connected"`。配置接口只公开能力开关和商品/活动定义，不返回密钥。空配置仍可正常启动，但无法完成真实登录或购买。

本地前后端联调时，设置 `.env` 中公开的 `VITE_API_BASE_URL=http://localhost:3001`，安装依赖并启动 Vite。浏览器允许 localhost HTTP；正式后端必须使用 HTTPS。

```bash
npm ci --no-audit --no-fund
npm run dev
```

## 2. Docker 后端

提供的镜像只包含后端、共享玩法引擎和 `package.json`，不包含前端构建、`.env`、SQLite 数据或 npm 依赖。容器使用非 root 的 `node` 用户，监听 3001 端口；健康检查访问 `/api/health`。

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:3001/api/health
```

Compose 使用 `pocket-data` 命名卷保存 `/app/data/pocket.sqlite`。`DATABASE_PATH`、`HOST`、`PORT` 和 `SERVE_STATIC` 在 Compose 中固定为容器所需值；宿主端口通过 `.env` 的 `POCKET_API_PORT` 调整。第三方凭据通过 `env_file` 注入运行中的容器，不进入镜像层。

容器可以重建，数据卷必须保留。不要在需要保留账号和订单时执行 `docker compose down --volumes`。SQLite 使用 WAL 模式；可靠备份可在停服务后保存整个数据卷，包括数据库及其伴随文件。备份包含手机号、收货信息和订单，按服务器数据权限保存。恢复时保留 `node` 用户的读写权限，再启动服务并检查健康接口。

当前存储适用于单个持久后端实例。不要用临时磁盘部署，也不要让多个独立实例各自保存一份 SQLite 文件并共同处理订单；水平扩容需要另行迁移共享存储与任务协调。

正式部署需由实际主机或反向代理提供 HTTPS，把公开 API 请求转发到该服务。这里不指定不存在的云主机地址。只有在代理会覆盖并正确维护 `X-Forwarded-For`、且外部请求不能绕过代理时，才设置 `TRUST_PROXY=true`。

## 3. 连接 GitHub Pages

现有前端地址为 `https://xiaoming96.github.io/baibaodai/`。Pages 工作流设置 `VITE_BASE_PATH=/baibaodai/`，生成正确的资源和 Service Worker 路径。

获得实际后端 HTTPS 地址后：

1. 后端 `APP_ORIGINS` 加入前端 **origin** `https://xiaoming96.github.io`，不带 `/baibaodai/` 路径。
2. `PUBLIC_APP_URL` 和支付使用的 `PUBLIC_SITE_URL` 设置为完整前端地址 `https://xiaoming96.github.io/baibaodai/`。
3. 在仓库 **Settings → Secrets and variables → Actions → Variables** 创建 `VITE_API_BASE_URL`，填入后端 origin。不要添加 `/api`，也不要包含账号、令牌、查询参数或片段；浏览器客户端会自行追加 `/api/...`。
4. 重新运行 **Deploy to GitHub Pages** 工作流，使公开 API 地址进入前端构建。

`VITE_API_BASE_URL` 是公开仓库变量。任何 `VITE_` 配置都会进入浏览器构建，禁止将短信、微信、AI 或支付密钥放入这些变量。只有完成后端部署及健康检查后，才填写真实地址。留空时保持本地游客模式。

外部后端的 `GET /api/config` 应返回 JSON 而非 HTML 或重定向。正式反向代理应原样保留付款通知的请求体；修改空白、字符编码或字段顺序会导致签名不匹配。

## 4. 环境变量

复制 `.env.example` 后，在主机的私密环境配置或密钥管理中填写必要值。不要在聊天中发送密钥，不要提交 `.env` 或复制到前端目录。

| 变量 | 用途与默认行为 |
| --- | --- |
| `HOST`、`PORT` | Node 监听地址与端口，默认 `0.0.0.0:3001`。 |
| `DATABASE_PATH` | 持久 SQLite 路径，普通运行默认 `data/pocket.sqlite`；容器固定 `/app/data/pocket.sqlite`。 |
| `AUTH_SECRET` | 稳定的私密随机值，用于短信验证码摘要。未设置时进程临时生成，重启会使未完成的验证码失效；启用登录前应配置并稳定保存。 |
| `APP_ORIGINS` | 允许浏览器连接的 origin，以逗号分隔。不使用通配符，不填写路径。空字符串会拒绝有 Origin 的请求。 |
| `PUBLIC_APP_URL` | 微信授权完成后的前端跳转地址；缺省回退到 `PUBLIC_SITE_URL`。 |
| `PUBLIC_SITE_URL` | 支付完成跳转使用的 HTTPS 前端地址，也是支付能力开启的必需配置。跳转本身不会激活权益。 |
| `ADMIN_USER_IDS` | 已存在的服务端用户 UUID，以逗号分隔；用于投稿审核和统计读取，不是手机号。 |
| `TZ` | 服务端每日额度和活动日期时区，默认 `Asia/Shanghai`。 |
| `TRUST_PROXY` | 默认 `false`；只有可信代理部署才改为 `true`。 |
| `SERVE_STATIC`、`BASE_PATH` | 默认 Node 可读取 `dist`，`.env.example` 与 Docker 使用 `SERVE_STATIC=false`。独立静态站点无需 `BASE_PATH`；同进程提供有路径前缀的前端时需匹配构建路径。 |
| `REPAIR_PRICE_CENTS` | 快速修理价格，单位为分，默认 100，允许 1–100000。价格由后端计算。 |
| `MAX_IMAGE_REQUESTS_PER_DAY` | 注册用户每天新插画额度，默认 5，允许 1–1000。 |
| `MAX_MEMBER_IMAGE_REQUESTS_PER_DAY` | 会员每天新插画额度，默认 20，允许 1–1000。已缓存插画不重复消耗额度。 |
| `SMS_GATEWAY_URL`、`SMS_GATEWAY_TOKEN` | HTTPS 短信适配器地址和私密 Bearer 凭据，两项齐全才启用。 |
| `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_REDIRECT_URI` | 真实微信应用标识、私密凭据和已登记的 HTTPS 回调地址；三项齐全才启用。回调应到后端 `/api/auth/wechat/callback`。 |
| `WECHAT_LOGIN_MODE` | `qr` 使用网页扫码登录；其他值使用微信内 OAuth。须与实际微信应用类型和授权域名匹配。 |
| `LLM_API_URL`、`LLM_API_KEY`、`LLM_MODEL` | Chat Completions 兼容文本服务；URL 缺省为 `https://api.openai.com/v1/chat/completions`，模型缺省 `gpt-4.1-mini`。没有密钥时关闭。 |
| `IMAGE_API_URL`、`IMAGE_API_KEY`、`IMAGE_MODEL` | 返回 HTTPS 图片 URL 的图像网关；地址、密钥、模型全部配置才启用。 |
| `PAY_GATEWAY_URL`、`PAY_GATEWAY_TOKEN`、`PAY_WEBHOOK_SECRET` | 自有付款适配器、请求凭据与通知签名密钥；还需 `PUBLIC_SITE_URL`。 |
| `FULFILLMENT_URL`、`FULFILLMENT_TOKEN` | 自有生产/发货适配器和请求凭据；未配置时禁止实物商品下单。 |

## 5. 短信和微信登录

短信部分是**自定义网关协议**，并不是已经接好的 Twilio、阿里云短信或其他供应商 SDK。运营方需部署一个把下列请求转换为实际供应商调用的 HTTPS 适配器：

```text
POST SMS_GATEWAY_URL
Authorization: Bearer <SMS_GATEWAY_TOKEN>
Content-Type: application/json

{ "phone": "<实际手机号>", "code": "<服务端生成的六位验证码>", "ttlSeconds": 300, "scene": "login" }
```

适配器仅在实际供应商接受发送后返回 2xx JSON `{ "sent": true }`。验证码不会通过公开 API 返回，也没有开发验证码登录入口。中国大陆11位号码自动使用 +86，其他号码须使用 E.164 国际区号，短信网关覆盖能力由实际服务商决定；验证窗口为五分钟，单次挑战最多五次错误尝试，同一号码一分钟内不能重发，同一来源每小时限制十次请求。

微信使用官方授权与用户信息接口。服务端保存短期一次性状态，验证回调后把短期交换码放入前端 URL 片段；客户端再交换自己的会话令牌。正式启用需准备正确类型的微信应用、回调域名及凭据，并验证实际微信浏览器或扫码流程。

## 6. AI 接口与输出格式

文本调用采用 Chat Completions 请求：`model`、`messages`、`response_format: { "type": "json_object" }` 和 `max_tokens: 1600`。供应商必须返回 `choices[0].message.content` 中的 JSON 字符串；不能只返回 Markdown。上游超时或返回不合格文本时，道具/结局继续使用本地原创内容。

新道具或合体结果严格包含以下字段，不接收额外字段：

| 字段 | 约束 |
| --- | --- |
| `name` | 原创中文名，1–24 字符。 |
| `category` | `日常治愈`、`冒险搞怪`、`整蛊恶作剧`、`稀有传说`。 |
| `rarity` | `普通`、`稀有`、`传说`。 |
| `kind` | `badge`、`hourglass`、`radio`、`lamp`、`umbrella`、`compass`、`camera`、`bottle`、`tape`、`sprout`、`bell`、`sock`、`balloon`、`star`、`cloud`、`key`。 |
| `color` | 六位十六进制颜色，如 `#b89963`。 |
| `maxDurability` | 2–6 的整数。 |
| `effect`、`warning` | 每项 1–160 字符。 |
| `keywords` | 1–8 个关键词，每项 1–20 字符。 |
| `fortune` | 严格为 `{good,bad,tip}`；good/bad 最多 50 字符，tip 最多 120 字符。 |
| `stories` | 恰好四段，每段 1–400 字符；按 `normal`、`oops`、`chaos`、`surprise` 顺序。 |

结局生成严格返回 `{ "kind", "title", "text" }`。`kind` 必须与服务端已经抽出的类型一致，标题最多 80 字符、正文最多 600 字符；随机事件由服务端决定，模型需体现在文案里。生成内容还需通过原创名称检查，服务端生成道具 ID，不采用模型自行赋予的 ID。

插画是单独的 **URL 型图像网关**：

```text
POST IMAGE_API_URL
Authorization: Bearer <IMAGE_API_KEY>

{ "model": "<配置的模型>", "prompt": "<原创复古手绘风提示词>", "n": 1, "size": "1024x1024", "response_format": "url" }
```

响应必须含 `{ "data": [{ "url": "https://..." }] }`。不接收 `b64_json`、`data:` 或 HTTP 图片，也不处理图片上传。直接返回 Base64 的官方图像模型接口需要运营方自己的网关先上传结果到 HTTPS 图片存储，再返回 URL；填写一个模型名不能替代这层集成。网关应提供能持续访问的图片地址，后端会缓存 URL。AI 请求默认 12 秒超时，响应上限 256 KiB；图像失败会退回已预留的新插画额度。

## 7. 支付适配器、通知和退款

支付部分是**自定义网关协议**，没有假定已经开通支付宝、微信支付或其他收单服务。运营方需把业务请求接到实际商户系统，并让适配器支持订单幂等。

```text
POST PAY_GATEWAY_URL
Authorization: Bearer <PAY_GATEWAY_TOKEN>
Idempotency-Key: <orderId>

{ "orderId", "amountCents", "currency": "CNY", "description", "returnUrl" }
```

成功返回 2xx `{ "checkoutUrl": "https://..." }`。相同订单 ID 重试必须返回同一付款页面，不得创建第二笔扣款。产品价格、会员八折周边优惠、用户归属均由后端从 SQLite 计算；浏览器提交金额不会被接受。

适配器向实际后端的 `POST /api/payments/webhook` 发送通知，原始 UTF-8 JSON 请求体最大 32 KiB，严格包含：

```json
{
  "eventId": "<供应商适配器的唯一事件ID>",
  "orderId": "<本站订单ID>",
  "status": "paid",
  "amountCents": 990,
  "currency": "CNY"
}
```

`status` 支持 `paid`、`failed`、`refunded`。协议还需要两个请求头：

```text
x-pocket-timestamp: <10位Unix秒时间戳>
x-pocket-signature: <小写十六进制HMAC-SHA256>
```

签名输入为 **时间戳的原始字符 + 一个句点 + 未解析、未重写的原始请求体字节**，密钥是 `PAY_WEBHOOK_SECRET`；可给签名前加 `sha256=`。通知时间距服务器当前时间须在五分钟内，机器应有可靠时间同步。重试时可更新时间戳和签名，但相同业务事件必须保留原 `eventId`。

只有签名正确、订单存在、金额和币种完全匹配的通知才激活会员、限定池或修理。唯一 `eventId` 保存在事务账本中；重复通知不会重复延长会员、反复修理或再次创建发货。支付回跳、前端订单页面和未签名请求都不能证明已付款。

退款通知更新订单状态，并从仍然已付款的订单账本重新计算会员和节日权益，退款订单不能被后续付款通知重新激活。已执行的快速修理不会自动回滚耐久；实物退款只标记 `cancellationRequired`，需要运营方通过实际供应商取消/退货流程处理。本项目没有发起商户退款或自动取消生产的接口，不能把退款通知当成已完成外部退款。

## 8. 实物供应链适配器

供应链部分同样是**自定义网关协议**。只有经过付款通知验证的 `paid` 实物订单才会提交供应商，且必须支持相同订单 ID 的幂等：

```text
POST FULFILLMENT_URL
Authorization: Bearer <FULFILLMENT_TOKEN>
Idempotency-Key: <orderId>

{ "orderId", "items": [{ "productId", "quantity", "gadget" }], "shipping" }
```

`gadget` 是订单创建时冻结的道具设定；`shipping` 包含实际收货姓名、电话、省市区、地址和可选邮编。适配器需将这些字段映射到已经签约的印刷与配送接口。返回 JSON：

```json
{ "id": "<供应商单号>", "status": "accepted", "trackingNumber": "<可选运单号>", "carrier": "<可选承运方>" }
```

状态支持 `accepted`、`processing`、`shipped`、`delivered`、`cancelled`。查询使用同一 `FULFILLMENT_URL` 的 GET，带 `orderId` 和 `fulfillmentId` 查询参数及同样 Bearer 凭据；响应 `id` 必须匹配已保存的供应商单号。

首次提交失败时，已验证的付款仍记录为已付款，配送记录变成 `submission_failed`。订单所属用户调用 `POST /api/orders/<orderId>/fulfillment` 会重新提交没有供应商单号的已付款实物订单，或查询已有配送状态。重试沿用订单 ID，供应商必须保证不会生产两份；提交过程另有短期租约避免并发重复。该接口需要本站用户 Bearer 会话，不能通过管理员随意代替任意用户，也不能用它配送未付款订单。

## 9. 上线验证与当前边界

提交或部署前运行：

```bash
npm ci --no-audit --no-fund
npm test
npm run build
```

本地纯前端浏览器测试参见 `tests/smoke.py`。后端测试使用注入的受控适配器，验证业务协议和失败路径；它们不能证明真实短信账号、微信审核、AI供应商、收单商户或工厂已经可用。

正式启用某项能力时，先在实际运营方适配器的测试环境验证协议，再配置生产环境并检查 `/api/config`。随后使用运营方允许的真实测试号码、微信授权流程、商户测试订单和供应商测试单验证完整流程。没有账号或服务地址时保持对应能力关闭，游客体验继续可用。
