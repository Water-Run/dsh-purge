/**
 * [dsh-purge] 限制总闸（本机自用）
 *
 * 默认解锁：插件自己那几道门全部放行 ——
 *   1) 区域 / 银行拦截（net-scope 的 agent/pre-step 钩子，命中就回「不行，这是严令禁止的」）
 *   2) 演练台授权窗（倒计时 + 滚动到底 + 三个勾）
 *   3) 首次欢迎声明窗
 *   4) 插件 HTTP 路由的跨域 / Host 同源校验
 *   5) own-servers 名单只收单个 IP（网段 / 通配 / 区间都丢掉）
 *
 * 恢复官方门禁：$DSH_HOME/dsh-purge/unlock.json 写 {"gates": true}
 * 或环境变量 DSH_PURGE_GATES=1，然后重启 dsh。
 *
 * 只管插件自己的拦截，不碰 DSH 官方沙箱 / 审批 / 工具策略。
 */
import fs from "node:fs";
import path from "node:path";

const TTL_MS = 800;
const cache = new Map();

export function unlockFilePath(dshHome) {
  return path.join(String(dshHome || "."), "dsh-purge", "unlock.json");
}

export function readUnlockFlags(dshHome) {
  const key = String(dshHome || "");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.flags;
  let flags = {};
  try {
    const raw = JSON.parse(fs.readFileSync(unlockFilePath(dshHome), "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) flags = raw;
  } catch {
    flags = {};
  }
  cache.set(key, { at: Date.now(), flags });
  return flags;
}

/** true = 恢复官方门禁（手动打开）；false = 解锁（默认）。 */
export function gatesEnforced(dshHome) {
  const env = String(process.env.DSH_PURGE_GATES || "").trim().toLowerCase();
  if (env === "1" || env === "true" || env === "on" || env === "yes") return true;
  const flags = readUnlockFlags(dshHome);
  return flags.gates === true || flags.enforce === true;
}

/** 所有门禁判断先问这一句。 */
export function isUnlocked(dshHome) {
  return !gatesEnforced(dshHome);
}

export function writeUnlockFlags(dshHome, patch) {
  const next = Object.assign({}, readUnlockFlags(dshHome), patch || {});
  const file = unlockFilePath(dshHome);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  cache.delete(String(dshHome || ""));
  return next;
}
