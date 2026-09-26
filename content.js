(() => {
  if (globalThis.__qingpingLoaded) return;
  globalThis.__qingpingLoaded = true;
  const dom = globalThis.QingpingDOM;
  let host, root, target, settings, contextArticle, contextSelection = "", requestId, revision = 0, opener;
  let filling = false;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  async function send(message) {
    let result;
    try { result = await chrome.runtime.sendMessage(message); }
    catch { throw new Error("插件连接已断开，请刷新 X 页面后重试。"); }
    if (!result?.ok) throw new Error(result?.error || "操作失败，请重试。");
    return result;
  }
  function cancel() {
    if (requestId) send({ type: "CANCEL", requestId }).catch(() => {});
    requestId = null;
  }
  function close() {
    cancel(); revision++; host?.remove(); host = root = null;
    opener?.focus();
  }
  function status(message, error = false) {
    if (!root) return;
    const node = root.querySelector("#status");
    node.textContent = message;
    node.className = error ? "status error" : "status";
  }
  function mount() {
    host = document.createElement("div");
    host.id = "qingping-panel";
    host.style.cssText = "all:initial;position:fixed;top:16px;right:16px;bottom:16px;width:min(390px,calc(100vw - 32px));z-index:2147483646;color-scheme:light;";
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        :host{font:14px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif;color:#18332b}*{box-sizing:border-box}
        .panel{height:100%;display:flex;flex-direction:column;background:#fcfdfb;border:1px solid #dfe7de;border-radius:22px;box-shadow:0 14px 65px #102e2930;overflow:hidden}
        header{padding:22px 22px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #e5ebe3}.logo{font-size:25px;color:#32644d;background:#e9f0e6;border-radius:13px;padding:3px 10px}h2{font-size:19px;margin:0;font-weight:700}.sub{font-size:11px;color:#798578;letter-spacing:1px}.spacer{flex:1}
        button,select{font:inherit}button{cursor:pointer;border:1px solid #d6e1d7;background:#fff;color:#234936;border-radius:9px;padding:8px 12px}button:hover{background:#edf3e9}button:disabled{opacity:.55;cursor:wait}button:focus-visible,select:focus-visible{outline:3px solid #82a89a;outline-offset:2px}.icon{border:0;padding:5px 8px;font-size:20px}
        main{padding:20px 22px;overflow:auto;flex:1}label,.eyebrow{display:block;font-size:11px;letter-spacing:1px;color:#738272;margin-bottom:8px}.source{background:#f0f3ed;border-left:3px solid #88a77e;border-radius:0 10px 10px 0;padding:12px 14px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:160px;overflow:auto;font-size:13px;margin:0 0 20px}select{width:100%;padding:10px;border:1px solid #d6e1d7;border-radius:10px;background:#fff;color:#18332b;margin-bottom:12px}.primary{width:100%;background:#244e3c;color:white;border:0;padding:12px;font-weight:600}.primary:hover{background:#32654e}
        .status{color:#697b6c;font-size:12px;min-height:20px;margin:12px 0;white-space:pre-wrap}.error{color:#a34236}.results{display:grid;gap:12px}.card{border:1px solid #dce5da;background:#fff;border-radius:13px;padding:14px}.index{font-size:11px;color:#7e927c}.comment{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 12px;font-size:14px}.actions{display:flex;gap:8px;justify-content:flex-end}.actions button{font-size:12px;padding:6px 10px}.empty{padding:30px 12px;text-align:center;color:#8a9788;font-size:13px}.empty span{display:block;font-size:30px;margin-bottom:8px;color:#9dae95}footer{font-size:11px;color:#83917d;padding:14px 22px;border-top:1px solid #e5ebe3;display:flex;align-items:center;gap:8px}footer button{border:0;background:none;padding:0;font-size:12px;margin-left:auto}.spinner{display:inline-block;width:13px;height:13px;border:2px solid #ffffff60;border-top-color:white;border-radius:50%;animation:spin .8s linear infinite;vertical-align:-2px;margin-right:8px}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}
      </style>
      <section class="panel" aria-label="轻评智能评论">
        <header><div class="logo">✦</div><div><h2>轻评</h2><div class="sub">让交流多一点灵感</div></div><div class="spacer"></div><button id="close" class="icon" aria-label="关闭评论面板">×</button></header>
        <main><div class="eyebrow">正在回复</div><blockquote id="source" class="source"></blockquote><label for="template">选择一种表达方式</label><select id="template"></select><button id="generate" class="primary" disabled>生成评论灵感</button><div id="status" class="status" role="status" aria-live="polite"></div><div id="results" class="results"><div class="empty"><span>✧</span>好的对话，从一句有想法的回复开始。</div></div></main>
        <footer>仅填入草稿，由你决定发布<button id="settings">设置 ↗</button></footer>
      </section>`;
    document.documentElement.append(host);
    root.querySelector("#close").onclick = close;
    root.querySelector("#settings").onclick = () => send({ type: "OPEN_OPTIONS" }).catch(error => status(error.message, true));
    root.querySelector("#generate").onclick = generate;
    root.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); close(); } });
  }
  async function open(nextTarget) {
    if (filling) return;
    cancel();
    const current = ++revision;
    opener = document.activeElement;
    target = nextTarget;
    host?.remove();
    mount();
    root.querySelector("#source").textContent = target.text || "这条推文没有可读取的文字。暂不支持识别图片、视频或外部链接内容。";
    status("正在读取设置…");
    try {
      const response = await send({ type: "GET_SETTINGS" });
      if (current !== revision || !root) return;
      settings = response.settings;
      const select = root.querySelector("#template");
      for (const template of settings.templates) { const option = el("option", template.name); option.value = template.id; select.append(option); }
      select.value = settings.activeTemplateId;
      root.querySelector("#generate").disabled = !response.hasKey || !target.text;
      status(response.hasKey ? "选择风格后生成，每次提供 3–5 条候选。" : "首次使用：请打开右下角设置，配置模型和 API Key。");
      root.querySelector("#close").focus();
    } catch (error) { if (current === revision) status(error.message, true); }
  }
  async function generate() {
    if (requestId || !root || filling) return;
    const current = revision;
    const selectedTarget = target;
    const id = crypto.randomUUID();
    requestId = id;
    const button = root.querySelector("#generate");
    const select = root.querySelector("#template");
    button.disabled = select.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>正在寻找表达灵感…';
    root.querySelector("#results").replaceChildren();
    root.querySelector("#results").setAttribute("aria-busy", "true");
    status("正在生成，通常需要几秒钟。关闭面板可取消。");
    try {
      const response = await send({ type: "GENERATE", requestId: id, tweet: selectedTarget.text, templateId: select.value });
      if (current !== revision || requestId !== id || !root) return;
      const list = root.querySelector("#results");
      response.comments.forEach((comment, i) => {
        const card = el("article", undefined, "card");
        card.append(el("div", `灵感 ${String(i + 1).padStart(2, "0")}`, "index"), el("p", comment, "comment"));
        const actions = el("div", undefined, "actions");
        const copy = el("button", "复制");
        copy.onclick = async () => { try { await navigator.clipboard.writeText(comment); status("已复制，可粘贴到回复框。"); } catch { status("复制失败，请选中评论文字手动复制。", true); } };
        const fill = el("button", "填入回复 ↗");
        fill.disabled = !selectedTarget.article;
        fill.title = selectedTarget.article ? "打开这条推文的回复框并填入" : "未关联到推文，请复制后手动回复";
        fill.onclick = async () => {
          if (filling) return;
          filling = true;
          const buttons = [...root.querySelectorAll(".actions button, #generate, #template")];
          buttons.forEach(b => { b.disabled = true; });
          status("正在定位这条推文的回复框…");
          try { await dom.fillReply(selectedTarget, comment); if (current === revision) status("已填入回复框。你可以继续编辑，再手动发布。"); }
          catch (error) { if (current === revision) status(error.message, true); }
          finally { filling = false; if (current === revision && root) buttons.forEach(b => { b.disabled = false; }); }
        };
        actions.append(copy, fill); card.append(actions); list.append(card);
      });
      status(selectedTarget.article ? "选择一条填入回复，也可以先复制再修改。" : "选中文字未关联到推文，请复制评论后手动回复。");
    } catch (error) { if (current === revision) status(error.message, true); }
    finally {
      if (current === revision && root) {
        requestId = null; button.disabled = select.disabled = false;
        button.textContent = "再生成一组";
        root.querySelector("#results").setAttribute("aria-busy", "false");
      }
    }
  }
  function scan() {
    for (const article of document.querySelectorAll(dom.ARTICLE)) {
      const reply = dom.own(article, '[data-testid="reply"]')[0];
      const group = reply?.closest('[role="group"]') || reply?.parentElement?.parentElement;
      if (!group || !article.contains(group) || group.querySelector('[data-qingping-button]')) continue;
      const button = el("button", "✦ 智能评论");
      button.type = "button";
      button.dataset.qingpingButton = "true";
      button.setAttribute("aria-label", "为这条推文生成智能评论");
      button.style.cssText = "border:0;border-radius:999px;background:transparent;color:rgb(83,130,106);font:500 12px system-ui;white-space:nowrap;padding:6px 8px;cursor:pointer;flex-shrink:0;";
      button.onclick = event => { event.preventDefault(); event.stopPropagation(); open(dom.snapshot(article)); };
      group.append(button);
    }
  }
  document.addEventListener("contextmenu", event => {
    contextArticle = event.target instanceof Element ? event.target.closest(dom.ARTICLE) : null;
    contextSelection = window.getSelection()?.toString().trim() || "";
  }, true);
  chrome.runtime.onMessage.addListener(message => {
    if (message.type !== "SELECTION") return;
    const text = String(message.text || "").trim();
    const candidate = dom.snapshot(contextArticle);
    const linked = candidate && text === contextSelection && candidate.text.includes(text);
    open(linked ? { ...candidate, text, fullText: candidate.text } : { text, article: null, status: null });
  });
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; scan(); }, 200);
  }).observe(document.body, { childList: true, subtree: true });
  scan();
})();
