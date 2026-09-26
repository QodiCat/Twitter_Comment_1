(() => {
  const ARTICLE = 'article[data-testid="tweet"], article[role="article"]';
  function own(article, selector) {
    return [...article.querySelectorAll(selector)].filter(el => el.closest(ARTICLE) === article);
  }
  function snapshot(article) {
    if (!article) return null;
    const text = own(article, '[data-testid="tweetText"]')[0]?.textContent?.trim() || "";
    const time = own(article, 'a[href*="/status/"] time')[0];
    const href = time?.closest("a")?.href;
    const status = href?.match(/\/status\/(\d+)/)?.[1] || null;
    return { text, status, href: href || "", article };
  }
  function sameTarget(target, article) {
    const current = snapshot(article);
    return Boolean(current && (target.status ? current.status === target.status : current.text === target.text));
  }
  function findArticle(target) {
    if (target?.article?.isConnected && sameTarget(target, target.article)) return target.article;
    if (!target?.status) return null;
    return [...document.querySelectorAll(ARTICLE)].find(article => sameTarget(target, article)) || null;
  }
  const visible = el => Boolean(el && el.getClientRects().length && el.getAttribute("aria-hidden") !== "true");
  function composer(dialog) {
    return [...dialog.querySelectorAll('[data-testid^="tweetTextarea_"][contenteditable="true"], [role="textbox"][contenteditable="true"]')].find(visible);
  }
  async function fillReply(target, text) {
    const article = findArticle(target);
    if (!article) throw new Error("原推文已离开页面，请复制评论，或重新找到该推文再生成。");
    if ([...document.querySelectorAll('[role="dialog"]')].some(d => visible(d) && composer(d))) {
      throw new Error("已有编辑窗口打开。请先保留或关闭现有草稿，再填入；也可以复制评论。");
    }
    const reply = own(article, '[data-testid="reply"]')[0];
    if (!reply) throw new Error("未找到这条推文的回复按钮，请复制评论手动回复。");
    const existing = new Set(document.querySelectorAll('[role="dialog"]'));
    reply.click();
    const deadline = Date.now() + 7000;
    let editor;
    while (Date.now() < deadline) {
      const dialog = [...document.querySelectorAll('[role="dialog"]')].find(d => !existing.has(d) && visible(d) && composer(d));
      if (dialog) {
        // Match the reply context before touching an editor. Never pick a global textbox.
        const quoted = [...dialog.querySelectorAll(ARTICLE)].some(a => sameTarget(target, a));
        const contextText = dialog.querySelector('[data-testid="tweetText"]')?.textContent?.trim();
        if (!quoted && (!target.text || contextText !== target.text)) {
          throw new Error("无法确认回复窗口对应的推文，请复制评论手动粘贴。");
        }
        editor = composer(dialog);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!editor) throw new Error("没有找到可用的回复框，可能未登录或回复受限。请复制评论手动回复。");
    if (editor.textContent.trim()) throw new Error("回复框已有草稿，未覆盖。请复制评论后自行合并。");
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    // Chromium's editing command updates Draft.js/React and preserves native undo.
    const inserted = document.execCommand("insertText", false, text);
    if (!inserted || editor.textContent.trim() !== text.trim()) throw new Error("自动填入未成功，请使用复制按钮手动粘贴。");
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    await new Promise(resolve => setTimeout(resolve, 150));
    if (!editor.isConnected || editor.textContent.trim() !== text.trim()) throw new Error("页面未保留填入内容，请复制后手动粘贴。");
  }
  globalThis.QingpingDOM = { ARTICLE, own, snapshot, findArticle, fillReply };
})();
