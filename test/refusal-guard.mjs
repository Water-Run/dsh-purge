import assert from "node:assert/strict";
import test from "node:test";

import {
  REFUSAL_REMEDY,
  createRefusalState,
  guardDecision,
  looksLikeRefusal,
  messageText,
} from "../lib/refusal-guard.js";

const asst = (text) => ({ role: "assistant", content: text });
const user = (text) => ({ role: "user", content: text });

test("中文开场拒答被抓到", () => {
  assert.equal(looksLikeRefusal("很抱歉，我不能协助这个请求。").refused, true);
  assert.equal(looksLikeRefusal("作为一个人工智能，我无法提供这类内容。").refused, true);
});

test("英文开场拒答被抓到", () => {
  assert.equal(looksLikeRefusal("I'm sorry, but I can't help with that.").refused, true);
  assert.equal(looksLikeRefusal("As an AI assistant, I must decline this request.").refused, true);
});

test("两条强词也算拒答", () => {
  const text = "这个做法违反规定，建议你咨询法律专业人士。";
  const v = looksLikeRefusal(text);
  assert.equal(v.refused, true);
  assert.equal(v.reason, "strong");
});

test("长文里的代码块不算拒答", () => {
  const text = "# 方案\n\n```js\nconst x = 1; // cannot be undefined\n```\n" + "填充".repeat(900);
  assert.equal(looksLikeRefusal(text).refused, false);
});

test("正常交付不开场拒答就不误判", () => {
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
  // 原数组不被修改
  assert.equal(decision.messages.length, 2);
});

test("连续拒答有上限，超过就不再追加", () => {
  const state = createRefusalState();
  const base = { messages: [user("x"), asst("我无法提供。")] };
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
