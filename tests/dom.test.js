import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
const code = await readFile(new URL("../tweet-dom.js", import.meta.url), "utf8");
const content = await readFile(new URL("../content.js", import.meta.url), "utf8");
const article = (id, text) => `<article data-testid="tweet"><a href="/person/status/${id}"><time>now</time></a><div data-testid="tweetText">${text}</div><div role="group"><button data-testid="reply">Reply</button></div></article>`;
function setup(html = article("123", "目标推文")) {
  const dom = new JSDOM(html, { url: "https://x.com/home", runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(code);
  dom.window.HTMLElement.prototype.getClientRects = () => [{ width: 100, height: 20 }];
  return dom;
}
test("snapshot extracts main tweet and resolves recycled/removed article by status", () => {
  const page = setup(article("123", "原文") + article("456", "另一条"));
  try {
    const api = page.window.QingpingDOM, doc = page.window.document;
    const target = api.snapshot(doc.querySelector("article"));
    assert.equal(target.text, "原文"); assert.equal(target.status, "123");
    doc.querySelector("article a").href = "/other/status/789";
    assert.equal(api.findArticle(target), null);
    doc.body.insertAdjacentHTML("beforeend", article("123", "原文"));
    assert.equal(api.snapshot(api.findArticle(target)).status, "123");
  } finally { page.window.close(); }
});
test("image-only posts do not incorrectly extract a quoted post's text", () => {
  const page = setup('<article data-testid="tweet"><a href="/person/status/123"><time>now</time></a><div role="link"><div data-testid="tweetText">这是被引用的推文</div></div></article>');
  try { assert.equal(page.window.QingpingDOM.snapshot(page.window.document.querySelector("article")).text, ""); }
  finally { page.window.close(); }
});
test("fills only a matching newly-opened reply, does not submit", async () => {
  const page = setup();
  try {
    const api = page.window.QingpingDOM, doc = page.window.document;
    const target = api.snapshot(doc.querySelector("article"));
    let submitted = false;
    doc.querySelector('[data-testid="reply"]').onclick = () => {
      doc.body.insertAdjacentHTML("beforeend", `<div role="dialog">${article("123", "目标推文")}<div role="textbox" contenteditable="true"></div><button id="submit">Post</button></div>`);
      doc.querySelector("#submit").onclick = () => { submitted = true; };
    };
    doc.execCommand = (command, show, text) => { assert.equal(command, "insertText"); doc.querySelector('[role="textbox"]').textContent = text; return true; };
    await api.fillReply(target, "评论草稿");
    assert.equal(doc.querySelector('[role="textbox"]').textContent, "评论草稿"); assert.equal(submitted, false);
  } finally { page.window.close(); }
});
test("does not touch unrelated dialogs or existing drafts", async () => {
  for (const scenario of ["existing", "wrong-target", "same-text-wrong-id", "draft"]) {
    const page = setup();
    try {
      const api = page.window.QingpingDOM, doc = page.window.document;
      const target = api.snapshot(doc.querySelector("article"));
      const wrongId = ["wrong-target", "same-text-wrong-id"].includes(scenario);
      const dialog = `<div role="dialog">${article(wrongId ? "999" : "123", scenario === "wrong-target" ? "另一条" : "目标推文")}<div role="textbox" contenteditable="true">保留草稿</div></div>`;
      if (scenario === "existing") doc.body.insertAdjacentHTML("beforeend", dialog);
      else doc.querySelector('[data-testid="reply"]').onclick = () => doc.body.insertAdjacentHTML("beforeend", dialog);
      doc.execCommand = () => { throw new Error("must not write"); };
      await assert.rejects(api.fillReply(target, "新评论"), /已有编辑窗口|无法确认|已有草稿/);
      assert.equal(doc.querySelector('[role="textbox"]').textContent, "保留草稿");
    } finally { page.window.close(); }
  }
});
test("dynamic feed injection avoids duplicate buttons and opens isolated panel", async () => {
  const page = setup();
  try {
    let requests = 0;
    page.window.chrome = { runtime: { onMessage: { addListener() {} }, sendMessage: async message => {
      requests++; assert.equal(message.type, "GET_SETTINGS");
      return { ok: true, hasKey: false, settings: { templates: [{ id: "a", name: "自然" }], activeTemplateId: "a" } };
    } } };
    page.window.eval(content);
    page.window.eval(content);
    const doc = page.window.document;
    assert.equal(doc.querySelectorAll('[data-qingping-button]').length, 1);
    doc.body.insertAdjacentHTML("beforeend", article("999", "滚动加载"));
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(doc.querySelectorAll('[data-qingping-button]').length, 2);
    doc.querySelector('[data-qingping-button]').click();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(requests, 1); assert.ok(doc.querySelector("#qingping-panel"));
    assert.equal(doc.querySelector("#qingping-panel").shadowRoot, null);
  } finally { page.window.close(); }
});
