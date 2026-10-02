import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { DEFAULT_SETTINGS } from "../core.js";
let listener, accessLevel, allowed = true;
const state = {};
globalThis.chrome = {
  runtime: { id: "test-extension", getURL: file => `chrome-extension://test-extension/${file}`, openOptionsPage: async () => {}, onMessage: { addListener(fn) { listener = fn; } }, onInstalled: { addListener() {} } },
  storage: { local: {
    async setAccessLevel(value) { accessLevel = value.accessLevel; },
    async get() { return structuredClone(state); },
    async set(value) { Object.assign(state, structuredClone(value)); },
    async remove(key) { delete state[key]; }
  } },
  permissions: { contains: async () => allowed },
  action: { onClicked: { addListener() {} } },
  contextMenus: { onClicked: { addListener() {} } }
};
await import("../background.js");
const options = { id: chrome.runtime.id, url: chrome.runtime.getURL("options.html") };
const content = { id: chrome.runtime.id, url: "https://x.com/home", tab: { id: 1 }, frameId: 0 };
const message = (value, sender = options) => new Promise(resolve => listener(value, sender, resolve));
const config = () => ({ ...structuredClone(DEFAULT_SETTINGS), model: "mock-model" });
test("message boundary, encrypted persistence, generation and cancellation", async t => {
  await t.test("storage is trusted-only; foreign senders and content writes are rejected", async () => {
    assert.equal(accessLevel, "TRUSTED_CONTEXTS");
    assert.equal((await message({ type: "GET_SETTINGS" }, { ...content, url: "https://evil.example" })).ok, false);
    assert.equal((await message({ type: "GET_SETTINGS" }, { ...content, id: "foreign" })).ok, false);
    assert.equal((await message({ type: "SAVE_SETTINGS", settings: config(), apiKey: "fake" }, content)).ok, false);
    assert.equal((await message({ type: "DELETE_KEY" }, content)).ok, false);
    assert.equal((await message({ type: "GET_SETTINGS" }, { ...options, url: options.url + "#templates" })).ok, true);
  });
  await t.test("save encrypts and never returns the key to content scripts", async () => {
    const saved = await message({ type: "SAVE_SETTINGS", settings: config(), apiKey: "test-only-credential" });
    assert.equal(saved.ok, true); assert.equal(saved.hasKey, true);
    assert(!JSON.stringify(state).includes("test-only-credential"));
    const result = await message({ type: "GET_SETTINGS" }, content);
    assert.equal(result.hasKey, true); assert.equal(result.secret, undefined);
    assert(!JSON.stringify(result).includes("test-only-credential"));
  });
  await t.test("background decrypts only for configured service and returns generated comments", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      assert.equal(init.headers.Authorization, "Bearer test-only-credential");
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"comments":["one","two","three"]}' } }] }) };
    };
    const result = await message({ type: "GENERATE", requestId: "first", tweet: "目标推文", templateId: "natural" }, content);
    assert.equal(result.ok, true); assert.deepEqual(result.comments, ["one", "two", "three"]);
  });
  await t.test("400 errors preserve saved credentials and blank-key saves keep the existing key", async () => {
    const before = structuredClone(state.secret);
    globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: {
      message: "Unsupported model for this endpoint", code: "unsupported_model"
    } }) });
    const failed = await message({ type: "GENERATE", requestId: "bad-model", tweet: "text" }, options);
    assert.equal(failed.ok, false);
    assert.match(failed.error, /Unsupported model/);
    assert.equal((await message({ type: "GET_SETTINGS" })).hasKey, true);
    assert.deepEqual(state.secret, before);
    const saved = await message({ type: "SAVE_SETTINGS", settings: { ...config(), model: "another-model" }, apiKey: "" });
    assert.equal(saved.hasKey, true);
    assert.deepEqual(state.secret, before);
  });
  await t.test("cancel aborts an in-flight request and concurrent clicks cannot create duplicate calls", async () => {
    let started;
    const startedPromise = new Promise(resolve => { started = resolve; });
    globalThis.fetch = async (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); started();
    });
    const running = message({ type: "GENERATE", requestId: "cancel-me", tweet: "text", templateId: "natural" }, content);
    await startedPromise;
    assert.equal((await message({ type: "GENERATE", requestId: "duplicate", tweet: "text" }, content)).ok, false);
    await message({ type: "CANCEL", requestId: "cancel-me" }, content);
    assert.match((await running).error, /取消/);
  });
  await t.test("revoked permissions and changed service cannot reuse a saved secret", async () => {
    allowed = false;
    assert.match((await message({ type: "GENERATE", requestId: "denied", tweet: "text" }, content)).error, /权限/);
    assert.equal((await message({ type: "SAVE_SETTINGS", settings: config() })).ok, false);
    allowed = true;
    const result = await message({ type: "SAVE_SETTINGS", settings: { ...config(), baseUrl: "https://other.example/v1" }, apiKey: "" });
    assert.equal(result.ok, true); assert.equal(result.hasKey, false); assert.equal(state.secret, null);
    assert.equal((await message({ type: "DELETE_KEY" })).ok, true);
    assert.equal(state.secret, undefined);
  });
});
