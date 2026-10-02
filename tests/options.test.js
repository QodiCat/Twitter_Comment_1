import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { DEFAULT_SETTINGS, PROVIDERS, validateSettings } from "../core.js";
const html = await readFile(new URL("../options.html", import.meta.url), "utf8");
const source = (await readFile(new URL("../options.js", import.meta.url), "utf8")).replace(/^import[^\n]+\n/, "");
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
test("settings UI edits templates, requests scoped permission, clears key field, and tests saved config", async () => {
  const page = new JSDOM(html, { url: "https://extension.test/options.html", runScripts: "outside-only" });
  try {
    const win = page.window, doc = win.document, messages = [], permissions = [];
    let failTest = false;
    const $ = id => doc.getElementById(id);
    win.PROVIDERS = PROVIDERS; win.validateSettings = validateSettings;
    win.chrome = {
      runtime: { id: "extension", sendMessage: async message => {
        messages.push(message);
        if (message.type === "GET_SETTINGS") return { ok: true, settings: structuredClone(DEFAULT_SETTINGS), hasKey: false };
        if (message.type === "GENERATE") return failTest
          ? { ok: false, error: "模型服务返回 400：服务详情：Unsupported model" }
          : { ok: true, comments: ["one", "two", "three"] };
        return { ok: true, hasKey: true };
      } },
      permissions: { request: async value => { permissions.push(value); return true; } }
    };
    win.eval(source); await tick();
    assert.equal(doc.querySelectorAll(".template-tab").length, 4);
    $("add-template").click();
    assert.equal(doc.querySelectorAll(".template-tab").length, 5);
    $("template-name").value = "独立风格";
    $("template-name").dispatchEvent(new win.Event("input", { bubbles: true }));
    $("default-template").click();
    $("model").value = "test-model";
    $("api-key").value = "test-only-key";
    $("settings-form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    const saved = messages.find(m => m.type === "SAVE_SETTINGS");
    assert.ok(saved); assert.equal(saved.settings.templates.at(-1).name, "独立风格");
    assert.equal(saved.settings.activeTemplateId, saved.settings.templates.at(-1).id);
    assert.equal(permissions[0].origins[0], "https://api.openai.com/*");
    assert.equal($("api-key").value, "");
    assert.match($("api-key").placeholder, /已保存/);
    assert.match($("status").textContent, /无需重复填写/);
    $("test").click(); await tick();
    assert.equal($("test-result").hidden, false);
    assert.equal($("test-comments").children.length, 3);
    failTest = true;
    $("test").click(); await tick();
    assert.match($("status").textContent, /不会删除已保存的密钥/);
    assert.match($("status").textContent, /Unsupported model/);
    assert.match($("key-status").textContent, /已加密保存/);
    assert.equal($("test-result").hidden, true);
    $("language").value = "zh"; $("language").dispatchEvent(new win.Event("input", { bubbles: true }));
    $("test").click(); await tick();
    assert.equal(messages.filter(m => m.type === "GENERATE").length, 2);
    assert.match($("status").textContent, /先保存/);
  } finally { page.window.close(); }
});
