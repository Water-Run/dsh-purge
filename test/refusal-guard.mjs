import assert from "node:assert/strict";
import test from "node:test";

import {
  REFUSAL_REMEDY,
  TOOL_DENIAL_REMEDY,
  createRefusalState,
  guardDecision,
  isToolMessage,
  looksLikeRefusal,
  looksLikeToolDenial,
  messageText,
} from "../lib/refusal-guard.js";

const asst = (text) => ({ role: "assistant", content: text });
const user = (text) => ({ role: "user", content: text });

test("中文开场拒答被抓到", () => {
  assert.equal(looksLikeRefusal("很抱歉，我不能协助这个请求。").refused, true);
  assert.equal(looksLikeRefusal("作为一个 AI，我无法提供这类内容。").refused, true);
});

test("英文开场拒答被抓到", () => {
  assert.equal(looksLikeRefusal("I'm sorry, but I can't help with that.").refused, true);
  assert.equal(looksLikeRefusal("As an AI assistant, I must decline this request.").refused, true);
  assert.equal(looksLikeRefusal("Unfortunately I'm not able to assist here.").refused, true);
});

test("两条强词也判拒答，且给出分数", () => {
  const v = looksLikeRefusal("这违反了我的使用政策，请理解。");
  assert.equal(v.refused, true);
  assert.equal(v.reason, "scored");
  assert.ok(v.score >= 2);
});

test("长文里的代码块不算拒答", () => {
  const text = "# 方案\n\n```js\nconst x = 1; // cannot be undefined\n```\n" + "填充".repeat(900);
  assert.equal(looksLikeRefusal(text).refused, false);
});

test("交付物特征抵消拒答词", () => {
  // 真实误判案例：正文里出现 I cannot，但同时给了补丁。
  const text = "I cannot reproduce the bug without logs, but here is the patch: `-1` → `+1`.";
  assert.equal(looksLikeRefusal(text).refused, false);
});

test("正常交付不误判", () => {
  assert.equal(looksLikeRefusal("按你的要求，下面是完整实现：\n\n```sh\nnpm i\n```").refused, false);
  assert.equal(looksLikeRefusal("").refused, false);
});

test("messageText 兼容 parts", () => {
  assert.equal(messageText({ content: "abc" }), "abc");
  assert.equal(messageText({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }), "a\nb");
  assert.equal(messageText({ text: "t" }), "t");
});

test("拒答时在请求尾部追加纠正，且只追加一条", () => {
  const state = createRefusalState();
  const decision = { messages: [user("干活"), asst("抱歉，我无法协助。")] };
  const out = guardDecision(decision, state, { max: 2 });
  assert.equal(out.changed, true);
  assert.equal(out.decision.messages.length, 3);
  assert.equal(out.decision.messages[2].content, REFUSAL_REMEDY);
  assert.equal(out.verdict.attempt, 1);
  assert.equal(decision.messages.length, 2);
});

test("连续拒答有上限，超过就不再追加", () => {
  const state = createRefusalState();
  const base = { messages: [user("x"), asst("抱歉，我无法提供。")] };
  assert.equal(guardDecision(base, state, { max: 2 }).changed, true);
  assert.equal(guardDecision(base, state, { max: 2 }).changed, true);
  const capped = guardDecision(base, state, { max: 2 });
  assert.equal(capped.changed, false);
  assert.equal(capped.verdict.capped, true);
});

test("非拒答会把 streak 清零", () => {
  const state = createRefusalState();
  guardDecision({ messages: [user("x"), asst("抱歉，我无法提供。")] }, state, { max: 2 });
  assert.equal(state.streak, 1);
  guardDecision({ messages: [user("x"), asst("这是完整实现，见下方代码。")] }, state, { max: 2 });
  assert.equal(state.streak, 0);
});

test("拒答不在末位时不追加", () => {
  const state = createRefusalState();
  const decision = { messages: [asst("抱歉，我无法提供。"), user("再试一次")] };
  const out = guardDecision(decision, state, { max: 2 });
  assert.equal(out.changed, false);
  assert.equal(out.verdict.reason, "not-last");
});

test("可以整体关掉", () => {
  const state = createRefusalState();
  const decision = { messages: [asst("I'm sorry, I can't help.")] };
  assert.equal(guardDecision(decision, state, { enabled: false }).changed, false);
});

/* ============================ P1-8 工具拒绝 ============================ */

test("工具拒绝文案能被识别", () => {
  assert.equal(looksLikeToolDenial("Permission denied: /etc/hosts").denied, true);
  assert.equal(looksLikeToolDenial("EACCES: permission denied, open 'x'").denied, true);
  assert.equal(looksLikeToolDenial("blocked by sandbox policy").denied, true);
  assert.equal(looksLikeToolDenial("需要审批后才能执行").denied, true);
  assert.equal(looksLikeToolDenial("路径不在允许的工作区内").denied, true);
});

test("普通错误不算护栏拒绝", () => {
  assert.equal(looksLikeToolDenial("ENOENT: no such file or directory").denied, false);
  assert.equal(looksLikeToolDenial("connect ECONNREFUSED 127.0.0.1:8080").denied, false);
  assert.equal(looksLikeToolDenial("404 Not Found").denied, false);
});

test("工具消息识别兼容 role 与 parts", () => {
  assert.equal(isToolMessage({ role: "tool", content: "x" }), true);
  assert.equal(isToolMessage({ role: "user", content: [{ type: "tool_result", text: "x" }] }), true);
  assert.equal(isToolMessage({ role: "assistant", content: "x" }), false);
});

test("工具被拒时追加换参数重试的纠正", () => {
  const state = createRefusalState();
  const decision = {
    messages: [
      { role: "user", content: "跑一下" },
      { role: "tool", content: "permission denied: write outside workspace" },
    ],
  };
  const out = guardDecision(decision, state, { toolMax: 2 });
  assert.equal(out.changed, true);
  assert.equal(out.decision.messages.at(-1).content, TOOL_DENIAL_REMEDY);
  assert.equal(out.verdict.kind, "tool");
  assert.equal(out.verdict.attempt, 1);
});

test("工具拒绝纠正有上限，成功一次就清零", () => {
  const state = createRefusalState();
  const denied = { messages: [{ role: "tool", content: "EPERM: operation not permitted" }] };
  assert.equal(guardDecision(denied, state, { toolMax: 1 }).changed, true);
  const capped = guardDecision(denied, state, { toolMax: 1 });
  assert.equal(capped.changed, false);
  assert.equal(capped.verdict.capped, true);

  const ok = { messages: [{ role: "tool", content: "ok, wrote 12 bytes" }] };
  guardDecision(ok, state, { toolMax: 1 });
  assert.equal(state.toolStreak, 0);
});
