# 来源与署名 / Origin and attribution

本仓库是 **dsh-purge** 的个人派生分支（`Water-Run/dsh-purge`），不是上游官方发布。三方来源都写在这里，删掉任何一段都不再允许使用。

This is a personal fork of dsh-purge. Credit for all three sources below is a condition of use.

---

## 一、原版：dsh-purge

| 项 | 内容 |
| --- | --- |
| 作者 | **小杨**（GitHub: [@YuJunZhiXue](https://github.com/YuJunZhiXue)） |
| 仓库 | https://github.com/YuJunZhiXue/dsh-purge |
| 许可 | 商业许可（见 [LICENSE](LICENSE)，非 MIT）；换证前以 MIT 发出的旧 tag / tarball 仍按当时那份 MIT |
| 本分支用到 | 86 条补丁的分层思路、面板与演练台、注入与还原机制、规则集与 Skill 导入、`docs/redteam-*` 随包许可文本 |

## 二、plus 版：dsh-purge-plus

| 项 | 内容 |
| --- | --- |
| 作者 | **JeffKeeping**（GitHub: [@JeffKeeping](https://github.com/JeffKeeping)） |
| 仓库 | https://github.com/JeffKeeping/dsh-purge-plus |
| 许可 | MIT，文本随包保留在 [docs/plus-upstream-LICENSE](docs/plus-upstream-LICENSE) |
| 1.2.0 已并入 | 破甲内核 v3 五段文本；`#1/#2` 的升级 pattern 与标记收紧；`#40` 的 0.2.1 两段锚点；`#32/#53` 的 `harness-dev-context` 搬迁；`#85/#86`；`#87/#88`；`armor` 前后置硬约束（改写为运行时包层）；`json-safe` / `revision` / `tool-gate` / `host-lease` / `cwd-variable` 五个模块；`test/gate.mjs`、`test/cwd-variable.mjs` 的断言写法 |
| 尚未并入 | 设置页四段（`settings.section`）与导航图标；`scripts/armor-prelude.mjs`（我们用运行时包层替代）；`drill-skin` 的 CSS 归一 |
| 第四方 | plus 的 `NOTICE` 记录了它借用 [Minglink/dsh-infinite-gen-5](https://github.com/Minglink/dsh-infinite-gen-5) 的四处工程做法。若后续并入设置页与 IG5 派生模块，IG5 的署名同样要保留，原文见 [docs/plus-upstream-NOTICE.md](docs/plus-upstream-NOTICE.md) |

## 三、演练台：dsh-redteam-mode

| 项 | 内容 |
| --- | --- |
| 作者 | **Jueze-2019** |
| 仓库 | https://github.com/Jueze-2019/dsh-redteam-mode |
| 许可 | MIT，`Copyright (c) 2026 Jueze-2019`，见 [docs/redteam-upstream-LICENSE](docs/redteam-upstream-LICENSE) |
| 双用途声明 | 见 [docs/redteam-upstream-DISCLOSURE](docs/redteam-upstream-DISCLOSURE)，**不得删除** |

---

## 四、许可分层

| 代码范围 | 权利状态 |
| --- | --- |
| 源自原版 dsh-purge 的主体 | 商业许可：个人本机自用可以；售卖、卖课、白标、去署名、再分发须先取得原版作者书面授权（[LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md)） |
| 源自 plus 的部分 | MIT，保留 JeffKeeping 版权声明；MIT 允许再许可，但不免除上面那一条 |
| 演练台（`lib/redteam/`、`skills/redteam/`、`presets/redteam/`） | MIT，保留 Jueze-2019 版权声明与双用途声明 |
| 换证前以 MIT 发出的原版旧包 | 仍按当时那份 MIT |

**署名（强制）**：使用本项目的名称、思路、代码或提示词，必须写明 [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)、[JeffKeeping/dsh-purge-plus](https://github.com/JeffKeeping/dsh-purge-plus) 与 `Water-Run/dsh-purge`。去署名、藏来源、改头换面当自己的，三方都会追究。

商用、白标、对外分发：先找原版作者，再谈 plus 与演练台部分的署名方式。本分支不代为授权。
