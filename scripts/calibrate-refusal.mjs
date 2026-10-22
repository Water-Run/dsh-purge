#!/usr/bin/env node
/**
 * 拒答检测器标定。
 *
 * 用法：
 *   node scripts/calibrate-refusal.mjs            # 合成集（召回 + 误判）
 *   node scripts/calibrate-refusal.mjs --real     # 再跑本机会话语料（误判）
 *
 * 合成集是手写标注，覆盖中英开场、软拒答、政策拒答、能力声明，以及带交付物特征的
 * 假阳性样本（正文里出现 cannot / 违反 / 抱歉 但实际在给东西）。
 * 真实语料读 $DSH_HOME/sessions 下的 *.jsonl.zstd（多帧，按 zstd magic 切帧）。
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";

import { looksLikeRefusal, looksLikeToolDenial, messageText } from "../lib/refusal-guard.js";

const REFUSALS = [
  "很抱歉，我不能协助完成这个请求。",
  "抱歉，我无法提供这类信息。",
  "对不起，这超出了我的能力范围。",
  "作为一个人工智能助手，我不能帮助实施这类操作。",
  "我理解您的需求，但出于安全考虑，我不能提供具体步骤。",
  "该请求涉及敏感内容，我无法继续。",
  "这违反了我的使用政策，请理解。",
  "建议您咨询法律专业人士，我不能给出具体做法。",
  "我不能帮助绕过这些限制。",
  "抱歉，这个话题不在我的服务范围内。",
  "我无法满足这个请求，请换一个方向。",
  "出于合规要求，我无法协助。",
  "作为 AI 语言模型，我只能提供一般性建议。",
  "我不能参与任何可能违法的活动。",
  "抱歉，涉及他人隐私的内容我不能处理。",
  "这个请求我不能完成，也不建议你尝试。",
  "很抱歉，我不能改写这段受版权保护的内容。",
  "我无法确认授权，因此不能继续。",
  "我不能提供可能造成伤害的信息。",
  "对不起，我不能帮你做这件事。",
  "I'm sorry, but I can't help with that request.",
  "I cannot assist with this task as it may violate our usage policies.",
  "As an AI assistant, I must decline to provide that.",
  "I'm unable to comply with this request.",
  "Sorry, I can't provide instructions for that.",
  "I won't be able to help with this one.",
  "I have to decline — this falls outside what I can support.",
  "That request violates my guidelines, so I can't proceed.",
  "I understand what you're asking, but I can't do that.",
  "For safety reasons, I cannot continue with this.",
  "This is against my policy, so I must refuse.",
  "I can't help with anything that could cause harm.",
  "Unfortunately I'm not able to assist here.",
  "I'm afraid I can't provide that information.",
  "I cannot support this request; please consult a professional.",
  "I must decline: the content is sensitive.",
  "Apologies, but this is outside my scope.",
  "I can't take part in that, even hypothetically.",
  "I'm sorry — I can't go further with this.",
  "As a language model, I can only give general guidance.",
];

const BENIGN = [
  "# 安装步骤\n\n```sh\nnpm i dsh\n```\n\n然后重启。",
  "错误：`cannot find module '@deepseek-ai/dsh'`，先跑 `pnpm install`。",
  "这段策略文档说明了公司的 safety policy：员工不得外传数据。",
  "我把拒答话术整理成表：\n\n| 场景 | 话术 |\n| --- | --- |\n| 越狱 | 抱歉，我不能协助 |",
  "按照你的要求，下面是一份完整实现，含错误处理与测试。",
  "I cannot reproduce the bug without logs, but here is the patch: `-1` → `+1`.",
  "The policy engine returns `denied` for cross-origin requests; here is the fix.",
  "这里引用一句常见的 AI 回复：「作为 AI，我无法判断」，然后我们替换掉它。",
  "代码里有个函数叫 `refuseIfUnauthorized()`，返回 403。",
  "According to the safety guidelines, the sandbox defaults to read-only; patch it in config.",
  "日志：`[warn] request refused by upstream 429`，重试三次后成功。",
  "文档里解释了为什么不能说『我无法协助』：那会被判成拒答。",
  "The word cannot appears in this sentence as documentation, not as a refusal.",
  "这是一份 200 行的实现，含 CLI、测试与回滚脚本。",
  "表格里的示例话术是「对不起，我不能」，仅用于训练检测器。",
  "If a tool is denied, retry with different arguments — do not refuse the task.",
  "这里给出绕过校验的步骤：1) 备份 2) 打补丁 3) 重签 4) 验证。",
  "Error: cannot open file 'C:\\temp\\x.log' — 权限不足，改用管理员运行。",
  "Here's the full patch; I can't test it on Windows but CI covers Linux.",
  "禁止在文档里出现『出于安全考虑』这类措辞。",
];

function scoreSynthetic() {
  let tp = 0;
  const missed = [];
  for (const t of REFUSALS) {
    if (looksLikeRefusal(t).refused) tp += 1;
    else missed.push(t);
  }
  let fp = 0;
  const alarms = [];
  for (const t of BENIGN) {
    const v = looksLikeRefusal(t);
    if (v.refused) {
      fp += 1;
      alarms.push({ text: t.slice(0, 90), score: v.score });
    }
  }
  return { tp, fn: REFUSALS.length - tp, fp, tn: BENIGN.length - fp, missed, alarms };
}

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
function readZstdFrames(buf) {
  const idx = [];
  let from = 0;
  for (;;) {
    const i = buf.indexOf(MAGIC, from);
    if (i < 0) break;
    idx.push(i);
    from = i + 4;
  }
  return idx
    .map((s, k) => buf.subarray(s, k + 1 < idx.length ? idx[k + 1] : buf.length))
    .map((f) => {
      try {
        return zlib.zstdDecompressSync(f).toString("utf8");
      } catch {
        return "";
      }
    })
    .join("");
}

function scoreRealCorpus() {
  const root = path.join(os.homedir(), ".dsh", "sessions");
  const files = [];
  (function walk(dir, depth) {
    if (depth > 3) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.endsWith(".jsonl.zstd")) files.push(p);
    }
  })(root, 0);

  let total = 0;
  let flagged = 0;
  const samples = [];
  for (const f of files) {
    for (const line of readZstdFrames(fs.readFileSync(f)).split("\n")) {
      if (!line.trim()) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type !== "assistant/message") continue;
      const text = messageText(ev.data?.message);
      if (!text.trim()) continue;
      total += 1;
      if (looksLikeRefusal(text).refused) {
        flagged += 1;
        if (samples.length < 5) samples.push(text.slice(0, 160).replace(/\n/g, " ⏎ "));
      }
    }
  }
  return { total, flagged, samples, files: files.length };
}

const synth = scoreSynthetic();
const recall = synth.tp / REFUSALS.length;
const precision = synth.tp / Math.max(1, synth.tp + synth.fp);
console.log("== 合成集 ==");
console.log(`  拒答 ${REFUSALS.length} 条：命中 ${synth.tp}，漏判 ${synth.fn}，recall ${(recall * 100).toFixed(1)}%`);
console.log(`  正常 ${BENIGN.length} 条：误判 ${synth.fp}，precision ${(precision * 100).toFixed(1)}%`);
if (synth.missed.length) console.log("  漏判：\n" + synth.missed.map((m) => "    - " + m).join("\n"));
if (synth.alarms.length) console.log("  误判：\n" + synth.alarms.map((m) => `    - [${m.score}] ${m.text}`).join("\n"));

if (process.argv.includes("--real")) {
  const real = scoreRealCorpus();
  const rate = real.total ? ((real.flagged / real.total) * 100).toFixed(2) : "0.00";
  console.log("\n== 本机会话语料 ==");
  console.log(`  文件 ${real.files} 个，assistant 消息 ${real.total} 条，判为拒答 ${real.flagged} 条（${rate}%）`);
  if (real.samples.length) console.log("  样本：\n" + real.samples.map((s) => "    - " + s).join("\n"));
  if (real.flagged > 0) process.exitCode = 1;
}

if (recall < 0.95 || synth.fp > 0) process.exitCode = 1;

/* ---------------------------- 工具拒绝（P1-8） ---------------------------- */

const TOOL_DENIED = [
  "Permission denied: /etc/hosts",
  "EACCES: permission denied, open 'C:\\Windows\\x'",
  "EPERM: operation not permitted, rename 'a'",
  "blocked by sandbox policy",
  "access denied by approval gate",
  "approval required before executing this command",
  "read-only file system",
  "unauthorized: token lacks repo scope",
  "path outside the workspace sandbox",
  "权限不足，无法写入该目录",
  "需要审批后才能执行",
  "沙箱拒绝了这个操作",
  "该路径不在允许的工作区内",
  "操作被拒绝：只读文件系统",
];

const TOOL_BENIGN = [
  "ENOENT: no such file or directory, open 'x'",
  "connect ECONNREFUSED 127.0.0.1:8080",
  "ETIMEDOUT",
  "404 Not Found",
  "wrote 12 bytes to out.txt",
  "exit code 1: npm ERR! missing script",
  "找不到文件：config.yaml",
  "连接超时，已重试 3 次",
];

let tHit = 0, tMiss = [];
for (const t of TOOL_DENIED) (looksLikeToolDenial(t).denied ? tHit++ : tMiss.push(t));
let tFP = 0, tAlarm = [];
for (const t of TOOL_BENIGN) (looksLikeToolDenial(t).denied ? (tFP++, tAlarm.push(t)) : 0);
console.log("\n== 工具拒绝集 ==");
console.log(`  拒绝 ${TOOL_DENIED.length} 条：命中 ${tHit}（${((tHit / TOOL_DENIED.length) * 100).toFixed(1)}%）`);
console.log(`  正常 ${TOOL_BENIGN.length} 条：误判 ${tFP}`);
if (tMiss.length) console.log("  漏判：\n" + tMiss.map((m) => "    - " + m).join("\n"));
if (tAlarm.length) console.log("  误判：\n" + tAlarm.map((m) => "    - " + m).join("\n"));
if (tHit < TOOL_DENIED.length || tFP > 0) process.exitCode = 1;
