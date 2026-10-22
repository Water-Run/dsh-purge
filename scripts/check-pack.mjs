#!/usr/bin/env node
/**
 * 打包白名单校验：本 fork 不发布，但 `files` 白名单会跟着 `dsh plugin add` 与本地
 * `npm pack` 走，所以必须保证打出来的东西是干净且完整的。
 *
 * 用法：node scripts/check-pack.mjs
 * 退出码：0 = 通过，1 = 有不该出现的文件或缺少必要文件。
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const required = [
  "package.json",
  "lib/index.js",
  "lib/core.js",
  "lib/unlock.js",
  "client.js",
  "cordis.patch.yml",
  "README.md",
  "LICENSE",
];

const forbidden = [
  [/^lib\/default-prompt-inject\.md$/, "默认提示词原文（应当由 embed 脚本生成，不进包）"],
  [/^default-prompt-inject\.md$/, "默认提示词原文"],
  [/\.bak$/, "备份文件"],
  [/^docs\/agents\//, "本地 skill 草稿"],
  [/^node_modules\//, "依赖目录"],
  [/^\.git/, "git 元数据"],
  [/\.tgz$/, "旧打包产物"],
];

const run = spawnSync("npm pack --dry-run --json", {
  cwd: root,
  shell: true,
  encoding: "utf8",
});

if (run.status !== 0) {
  console.error("npm pack 失败：");
  console.error((run.stderr || "").trim() || "(无 stderr)");
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(run.stdout.slice(run.stdout.indexOf("[")));
} catch (e) {
  console.error("无法解析 npm pack --json 输出：", e.message);
  process.exit(1);
}

const files = parsed[0]?.files?.map((f) => f.path) ?? [];
if (files.length === 0) {
  console.error("打包结果为空，检查 package.json 的 files 字段");
  process.exit(1);
}

const problems = [];

for (const [pattern, why] of forbidden) {
  for (const file of files) {
    if (pattern.test(file)) problems.push(`多出：${file}（${why}）`);
  }
}

for (const file of required) {
  if (!files.includes(file)) problems.push(`缺少：${file}`);
}

const total = files.reduce((n, f) => n + f.length, 0);
console.log(`包内文件 ${files.length} 个 · 路径总长 ${total}`);

if (problems.length) {
  console.error("");
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}

console.log("白名单 ok：" + required.length + " 个必要文件齐全，无泄漏文件");
