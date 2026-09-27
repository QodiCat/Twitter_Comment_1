import { PROVIDERS, validateSettings } from "./core.js";
const $ = id => document.getElementById(id);
let settings, editingId, dirty = false, busy = false;
function status(text, error = false) { $("status").textContent = text; $("status").className = error ? "error" : ""; }
async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "操作失败，请重试。");
  return response;
}
function markDirty() { dirty = true; status("有未保存的更改。"); }
function keyStatus(hasKey) {
  $("key-status").textContent = hasKey ? "密钥已加密保存" : "尚未配置密钥";
  $("key-status").className = hasKey ? "badge ready" : "badge";
  $("delete-key").disabled = !hasKey;
}
function renderTemplates() {
  $("template-list").replaceChildren();
  settings.templates.forEach(template => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `template-tab${template.id === editingId ? " active" : ""}`;
    button.setAttribute("aria-pressed", String(template.id === editingId));
    button.textContent = template.name || "未命名模板";
    if (template.id === settings.activeTemplateId) {
      const badge = document.createElement("span"); badge.textContent = "默认"; button.append(badge);
    }
    button.onclick = () => { editingId = template.id; renderTemplates(); };
    $("template-list").append(button);
  });
  const selected = settings.templates.find(t => t.id === editingId);
  $("template-name").value = selected.name;
  $("template-prompt").value = selected.prompt;
  $("delete-template").disabled = settings.templates.length === 1;
  $("default-template").textContent = editingId === settings.activeTemplateId ? "✓ 当前默认模板" : "设为默认";
}
function collect() {
  return validateSettings({
    ...settings, provider: $("provider").value, baseUrl: $("base-url").value, model: $("model").value,
    count: Number($("count").value), language: $("language").value
  });
}
function setBusy(value) {
  busy = value;
  $("save").disabled = $("test").disabled = value;
}
async function init() {
  if (!globalThis.chrome?.runtime?.id) {
    status("请通过 Chrome / Edge 的扩展管理页面加载本插件，再打开设置。", true);
    $("settings-form").inert = true;
    return;
  }
  const response = await send({ type: "GET_SETTINGS" });
  settings = response.settings; editingId = settings.activeTemplateId;
  for (const [id, value] of Object.entries({ provider: settings.provider, "base-url": settings.baseUrl, model: settings.model, count: settings.count, language: settings.language })) $(id).value = value;
  keyStatus(response.hasKey); renderTemplates();
  $("settings-form").addEventListener("input", markDirty);
  $("provider").onchange = () => {
    const provider = PROVIDERS[$("provider").value];
    $("base-url").value = provider.baseUrl; $("model").value = provider.model; $("api-key").value = "";
    status("切换服务后请填写模型 ID 和此服务的 API Key，再保存。");
  };
  $("toggle-key").onclick = () => {
    const show = $("api-key").type === "password";
    $("api-key").type = show ? "text" : "password";
    $("toggle-key").textContent = show ? "隐藏" : "显示";
    $("toggle-key").setAttribute("aria-label", show ? "隐藏 API Key" : "显示 API Key");
    $("toggle-key").setAttribute("aria-pressed", String(show));
  };
  for (const [id, field] of [["template-name", "name"], ["template-prompt", "prompt"]]) {
    $(id).oninput = () => {
      settings.templates.find(t => t.id === editingId)[field] = $(id).value;
      if (field === "name") {
        const active = $("template-list").querySelector(".active");
        active.firstChild.textContent = $(id).value || "未命名模板";
      }
    };
  }
  $("add-template").onclick = () => {
    if (settings.templates.length >= 30) return status("最多保存 30 个模板。", true);
    editingId = crypto.randomUUID();
    settings.templates.push({ id: editingId, name: "我的新风格", prompt: "请用自然、简洁的语气，回应推文中的具体观点。" });
    renderTemplates(); markDirty(); $("template-name").focus(); $("template-name").select();
  };
  $("delete-template").onclick = () => {
    if (settings.templates.length === 1) return;
    settings.templates = settings.templates.filter(t => t.id !== editingId);
    if (settings.activeTemplateId === editingId) settings.activeTemplateId = settings.templates[0].id;
    editingId = settings.templates[0].id; renderTemplates(); markDirty();
  };
  $("default-template").onclick = () => { settings.activeTemplateId = editingId; renderTemplates(); markDirty(); };
  $("delete-key").onclick = async () => {
    if (busy) return;
    setBusy(true);
    try { await send({ type: "DELETE_KEY" }); keyStatus(false); status("本机已保存的 API Key 已删除。"); }
    catch (error) { status(error.message, true); }
    finally { setBusy(false); }
  };
  $("settings-form").onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    try {
      const next = collect();
      const apiKey = $("api-key").value.trim();
      setBusy(true);
      // Request directly within the submit gesture, before awaiting any other work.
      const permitted = await chrome.permissions.request({ origins: [`${new URL(next.baseUrl).origin}/*`] });
      if (!permitted) throw new Error("未获得 API 网站访问权限，设置未保存。");
      const response = await send({ type: "SAVE_SETTINGS", settings: next, apiKey });
      settings = next; dirty = false; $("api-key").value = "";
      keyStatus(response.hasKey);
      status(response.hasKey ? "设置已保存。返回 X 页面，点击推文下方的「智能评论」。" : "设置已保存。填写并保存 API Key 后即可生成评论。");
    } catch (error) { status(error.message, true); }
    finally { setBusy(false); }
  };
  $("test").onclick = async () => {
    if (busy) return;
    if (dirty) return status("请先保存更改，再测试连接。", true);
    setBusy(true); $("test-result").hidden = true;
    $("test").textContent = "正在生成测试评论…";
    status("正在调用已保存的模型服务。此测试会产生一次正常 API 请求费用。");
    try {
      const response = await send({ type: "GENERATE", requestId: crypto.randomUUID(), templateId: settings.activeTemplateId, tweet: "今天终于完成了一个一直想做的小项目，过程比预想中困难，但很值得。" });
      $("test-comments").replaceChildren(...response.comments.map(text => { const li = document.createElement("li"); li.textContent = text; return li; }));
      $("test-result").hidden = false; status("连接成功，已生成测试评论。");
    } catch (error) { status(error.message, true); }
    finally { setBusy(false); $("test").textContent = "测试已保存连接"; }
  };
  window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
}
init().catch(error => { status(`无法加载设置：${error.message}`, true); $("settings-form").inert = true; });
