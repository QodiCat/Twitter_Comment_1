(() => {
  const ARTICLE = 'article[data-testid="tweet"], article[role="article"]';
  function own(article, selector) {
    return [...article.querySelectorAll(selector)].filter(el => el.closest(ARTICLE) === article);
  }
  function snapshot(article) {
    if (!article) return null;
    const mainText = own(article, '[data-testid="tweetText"]').find(node => {
      const quotedLink = node.closest('[role="link"]');
      return !quotedLink || !article.contains(quotedLink);
    });
    const text = mainText?.textContent?.trim() || "";
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
  function replyContextMatches(target, dialog) {
    // Only inspect the primary context, never a quoted tweet or the draft itself.
    const primary = [...dialog.querySelectorAll(ARTICLE)].find(node =>
      !node.parentElement.closest(ARTICLE) && !node.closest('[role="link"]:not(a), [contenteditable="true"]'));
    const scope = primary || dialog;
    const nodes = selector => [...scope.querySelectorAll(selector)].filter(node =>
      !node.closest('[contenteditable="true"]') &&
      (!primary || node.closest(ARTICLE) === primary) &&
      !node.closest('[role="link"]:not(a)'));
    const time = nodes('a[href*="/status/"] time')[0];
    const status = time?.closest('a')?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
    if (target.status && status) return target.status === status;
    const normalize = value => (value || '').replace(/\s+/gu, ' ').trim();
    const expected = normalize(target.fullText || target.text);
    const actual = normalize(nodes('[data-testid="tweetText"]')[0]?.textContent);
    return Boolean(expected && actual === expected);
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
    let sawComposer = false;
    while (Date.now() < deadline) {
      const dialog = [...document.querySelectorAll('[role="dialog"]')].find(d => !existing.has(d) && visible(d) && composer(d));
      if (dialog) {
        sawComposer = true;
        // The editor can mount before the reply context finishes rendering.
        if (replyContextMatches(target, dialog)) {
          editor = composer(dialog);
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!editor && sawComposer) throw new Error("无法确认回复窗口对应的推文，请复制评论手动粘贴。");
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
