import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const code = await readFile(new URL("../tweet-dom.js", import.meta.url), "utf8");
const context = (id, text, tag = "article") => `<${tag} data-testid="tweet"><a role="link" href="/person/status/${id}"><time>now</time></a><div data-testid="tweetText">${text}</div></${tag}>`;

for (const scenario of ["delayed", "no-article", "whitespace", "selection", "wrong-id", "quoted-id", "quoted-text", "missing", "draft"]) {
  test(`reply context: ${scenario}`, async () => {
    const page = new JSDOM(context("123", "目标 推文"), { url: "https://x.com/home", runScripts: "outside-only" });
    try {
      const { window } = page, doc = window.document;
      window.eval(code);
      window.HTMLElement.prototype.getClientRects = () => [{ width: 100 }];
      const api = window.QingpingDOM;
      const target = api.snapshot(doc.querySelector("article"));
      if (scenario === "selection") Object.assign(target, { text: "目标", fullText: target.text });
      // Advance the deadline without waiting seven seconds for rejection cases.
      let tick = 0;
      window.Date.now = () => tick++ * 500;
      const button = doc.createElement("button");
      button.dataset.testid = "reply";
      doc.querySelector("article").append(button);
      let writes = 0;
      doc.execCommand = (command, ui, text) => {
        writes++;
        doc.querySelector('[contenteditable]').textContent = text;
        return true;
      };
      button.onclick = () => {
        const dialog = doc.createElement("div");
        dialog.setAttribute("role", "dialog");
        dialog.innerHTML = `<div role="textbox" contenteditable="true">${scenario === "draft" ? "保留草稿" : ""}</div>`;
        doc.body.append(dialog);
        let html = context("123", "目标 推文");
        if (scenario === "no-article") html = context("123", "折叠正文", "div");
        if (["whitespace", "selection"].includes(scenario)) html = '<div data-testid="tweetText">目标\n&nbsp;推文</div>';
        if (scenario === "wrong-id") html = context("999", "目标 推文", "div");
        if (scenario === "quoted-id") html = context("999", "另一条") + `<div role="link">${context("123", "目标 推文")}</div>`;
        if (scenario === "quoted-text") html = '<div role="link"><div data-testid="tweetText">目标 推文</div></div>';
        if (scenario === "missing") html = "";
        if (scenario === "delayed") window.setTimeout(() => dialog.insertAdjacentHTML("afterbegin", html), 180);
        else dialog.insertAdjacentHTML("afterbegin", html);
      };
      if (["wrong-id", "quoted-id", "quoted-text", "missing", "draft"].includes(scenario)) {
        await assert.rejects(api.fillReply(target, "评论"), /无法确认|已有草稿/);
        assert.equal(writes, 0);
        assert.equal(doc.querySelector('[contenteditable]').textContent, scenario === "draft" ? "保留草稿" : "");
      } else {
        await api.fillReply(target, "评论");
        assert.equal(writes, 1);
        assert.equal(doc.querySelector('[contenteditable]').textContent, "评论");
      }
    } finally { page.window.close(); }
  });
}
