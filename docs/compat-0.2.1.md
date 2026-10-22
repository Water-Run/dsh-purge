# DeepSeek Harness 0.2.x 适配

本分支基于上游 master，已经包含上游的 0.2.0 适配提交：

- `e1d8e59` fix: 0.2.0 system prompt 修复 + patch89 + override 状态机
- `0a04bee` fix: 0.2.0 把注入打进原生 system 槽，子代理走同一条 assemble

这里记录在本机 **DSH 0.2.1-rc.2** 上补的一层适配。

## 1. 目标文件搬到了 profile

0.2.x 把插件依赖装进 `~/.dsh/profiles/node_modules`，`@earendil-works/pi-ai` 也从那里加载。
`core.targetFiles()` 现在解析到：

```
~/.dsh/profiles/node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js
~/.dsh/profiles/node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js
~/.dsh/profiles/node_modules/@earendil-works/pi-ai/dist/api/openai-responses-shared.js
```

`resources/app/dsh/node_modules` 下面那份是旧副本（之前版本打过 marker），状态判断不看它。

## 2. cwd 改成模板变量

`lib/core.js`、`lib/identity.js`、`cordis.patch.yml` 里写死的 `Working directory: .`
换成 `Working directory: {{cwd}}.`，与 0.2.x 的 persona 插值对齐；`CWD_ONLY_SUFFIX`
和 `isCwdOnlyText()` 同步改。

npm 上的 1.1.72 包里还是写死版本，所以本机安装已经同步成这个分支的写法。

## 3. 五个「0.2.0 兼容 / 代码」补丁

`#47` `#49` `#57` `#90` `#91` 以前写在 `resources/app/dsh/node_modules` 的副本里，
0.2.x 实际加载的是 profile 副本，所以状态一直是 pending。把补丁应用到 profile 副本后：

```
#47 -> applied   #49 -> applied   #57 -> applied   #90 -> applied   #91 -> applied
```

其中 `#57`（developer role 白名单）在 0.2.1 遇到了改名：

```js
// 0.2.1 responses 通路
const instructionRole = model.reasoning && compat?.supportsDeveloperRole !== false ? "developer" : "system";
```

上游 pattern 匹配的是 `const role = ...`，所以命不中。本分支补了一条 `instructionRole`
的 pattern，替换后只允许 `api.openai.com` / `azure.com` 走 `developer`，第三方网关回退 `system`。

## 4. 验证

```powershell
# 语法
node --check <patched>.mjs

# 状态（需要 DSH_HOME / DSH_PROFILE）
node -e "import('./lib/core.js').then(async c => console.log(await c.patchStatus(process.argv[1]+'/node_modules/@deepseek-ai')))" "C:/Users/<you>/AppData/Local/Programs/DeepSeek Harness/resources/app/dsh"
```

本机结果：`applied=68, na=11, skipped=6, missing_file=1`，五个补丁全 `applied`。
pi-ai 是进程启动时加载的，改完要重启 dsh 才生效。
