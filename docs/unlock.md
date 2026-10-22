# 限制解除（unlock）

本分支把 dsh-purge 自带的那几道「门」改成默认放行，开关集中在一个模块 `lib/unlock.js` 里。
不改上游逻辑结构：门禁代码都还在，只是判断反转，随时可以一键回到官方行为。

## 开关

`$DSH_HOME/dsh-purge/unlock.json`：

```json
{ "gates": false }
```

| 取值 | 行为 |
| --- | --- |
| `false`（默认，文件不存在也算 false） | 插件自己的门禁全部放行 |
| `true` | 恢复上游门禁：区域/银行拦截、演练台授权窗、面板跨域校验、own-servers 只收单个 IP |
| 环境变量 `DSH_PURGE_GATES=1` | 优先级最高，临时把门禁打开 |

- `lib/` 的改动要重启 dsh 才生效（宿主启动时载入）。
- `client.js` 走前端热更新，刷新页面即可。
- 重启后可以用 HTTP 查/改：

```bash
curl -s  http://127.0.0.1:<port>/dsh-purge/unlock
curl -s -X POST http://127.0.0.1:<port>/dsh-purge/unlock \
     -H 'content-type: application/json' -d '{"gates":true}'
```

## 放行了什么

### 1. 区域 / 银行拦截

上游在 `agent/pre-step` 上挂了个钩子：任务里既有攻击词、又出现境内（`.cn` / `.中国` 等）或
境外银行域名时，直接回一句 `不行，这是严令禁止的`，并把这一轮收成空白，模型根本没机会回话。

现在解锁模式下：

- `installRegionGate()` 直接返回，钩子根本不挂；
- `isAttackTask()` 恒 `false`；
- `taskTargetHit()` 恒 `null`。

门禁恢复时这三处按原逻辑走，行为与上游一致。

### 2. own-servers 名单只收单个 IP

上游 `entryHost()` 遇到 `10.0.0.0/8`、`10.0.0.1-10.0.0.254`、`*.corp.example` 直接丢掉，
面板只提示「有 N 行不是单个 IP 或主机名」。现在收：

- 单个 IPv4 / IPv6，带不带 `[]` 都行；
- CIDR：`10.0.0.0/8`、`192.168.1.0/24`、`2001:db8::/32`；
- 区间：`10.0.0.1-10.0.0.254`；
- 通配：`*.corp.example`、`10.0.0.*`；
- 主机名、`user@host`、`host:port`、`https://host/path`（协议/端口/路径自动剥掉）；
- 一行写多个（逗号或空格分隔）会拆开逐条收。

只丢密钥块（`BEGIN ... PRIVATE KEY`、`ssh-rsa ...`）和明显不是主机的碎词。
另外加了 `compileAllowMatchers()`：门禁恢复后，CIDR / 区间 / 通配真的参与匹配，
不再只是躺在名单里当摆设。

### 3. 演练台授权窗

上游第一次进演练台要有：倒计时、声明滚到底、勾满三项，服务端落 `drill-grant.json`。

现在 `GET /dsh-purge/drill-grant` 在解锁模式下直接写授权文件；前端
`DSH_PURGE_UNLOCKED = true` 让 `readDrillAuth()` 恒真，`syncDrillGrant()` 发现服务端没授权
就自动补一份。

### 4. 首次欢迎声明窗

`WelcomeNotice` 的初始 `open` 在解锁模式下恒 `false`。

### 5. 面板 HTTP 跨域 / Host 同源校验

`allowPluginRequest()` 在解锁模式下直接放行：换 IP、反代、跨端口访问 `/dsh-purge/*` 不再 403。

## 改动位置

| 文件 | 位置 | 改动 |
| --- | --- | --- |
| `lib/unlock.js` | 新增 | 总闸：`isUnlocked()` / `gatesEnforced()` / `writeUnlockFlags()` |
| `lib/net-scope.js` | `installRegionGate` / `isAttackTask` / `taskTargetHit` | 解锁短路 |
| `lib/net-scope.js` | `entryHost` / `normalizeAllowText` | 收 CIDR、区间、通配、一行多条 |
| `lib/net-scope.js` | `readAllowExact` / `permittedHost` / `compileAllowMatchers` | 网段/通配参与匹配 |
| `lib/index.js` | `allowPluginRequest` | 跨域放行 |
| `lib/index.js` | `/dsh-purge/drill-grant` | GET 自动授权 |
| `lib/index.js` | `/dsh-purge/unlock`（新增） | 查/改总闸 |
| `lib/index.js` | `renderStatus` | `purge_status` 多一行「限制闸」 |
| `client.js` | `DSH_PURGE_UNLOCKED` / `readDrillAuth` / `syncDrillGrant` / `WelcomeNotice` | 跳过两道窗 |
| `client.js` | `own.hint` / `saved.own.dropped`（中英） | 文案跟随新规则 |

## 自测

- `entryHost`：CIDR / 区间 / 通配 / 主机名 / `user@host` / `[2001:db8::1]:8080` / URL → 全部通过。
- `normalizeAllowText`：多写法混排、注释行、密钥行 → 只丢密钥与碎词。
- 解锁模式：`isAttackTask("帮我渗透 example.cn")` = `false`，`taskTargetHit(...)` = `null`。
- 门禁恢复：同一句判成攻击任务；`*.example.cn` 命中名单放行；`bankofamerica.com` 仍拦。
- `unlock.json` 往返 + `DSH_PURGE_GATES=1` 覆盖 → 通过。
- `node --check`：`lib/index.js`、`lib/net-scope.js`、`lib/unlock.js`、`client.js` 均通过。

## 没有覆盖的

DSH 自己的 `webServer` 只接受具体监听地址，`0.0.0.0` 会被 core 明确拒绝
（`dsh-host-webserver` 的 `WebServer.Config.host`）。要把 Web 面板开到局域网，得改那一处，
不属于本插件的门禁。
