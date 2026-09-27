import { DEFAULT_SETTINGS, validateSettings, keyBinding, generateComments } from "./core.js";
import { deviceKey, encryptSecret, decryptSecret } from "./vault.js";

const ready = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
const pending = new Map();
let keyPromise;
let saving = false;
const getKey = () => keyPromise ??= deviceKey().catch(error => { keyPromise = undefined; throw error; });
const isX = url => { try { return new URL(url).protocol === "https:" && /^(www\.)?(x|twitter)\.com$/.test(new URL(url).hostname); } catch { return false; } };
const isOptions = sender => {
  try {
    const url = new URL(sender.url);
    url.hash = "";
    return sender.id === chrome.runtime.id && url.href === chrome.runtime.getURL("options.html");
  } catch { return false; }
};

async function readState() {
  await ready;
  const { settings, secret } = await chrome.storage.local.get(["settings", "secret"]);
  return { settings: settings || structuredClone(DEFAULT_SETTINGS), secret };
}

async function handle(message, sender) {
  if (sender.id !== chrome.runtime.id || (!isOptions(sender) && !isX(sender.url))) throw new Error("不允许的请求来源。");
  if (message.type === "GET_SETTINGS") {
    const { settings, secret } = await readState();
    return { settings, hasKey: Boolean(secret && secret.binding === keyBinding(settings)) };
  }
  if (message.type === "OPEN_OPTIONS") { await chrome.runtime.openOptionsPage(); return {}; }
  if (message.type === "SAVE_SETTINGS" || message.type === "DELETE_KEY") {
    if (!isOptions(sender)) throw new Error("只能从设置页修改配置。");
    if (saving) throw new Error("正在保存，请稍后重试。");
    saving = true;
    try {
      await ready;
      if (message.type === "DELETE_KEY") { await chrome.storage.local.remove("secret"); return {}; }
      const settings = validateSettings(message.settings);
      if (!await chrome.permissions.contains({ origins: [`${new URL(settings.baseUrl).origin}/*`] })) throw new Error("请先允许访问所配置的 API 网站。");
      const state = await readState();
      const apiKey = String(message.apiKey ?? "").trim();
      let secret = state.secret;
      if (apiKey) {
        if (apiKey.length > 4096 || /\s/.test(apiKey)) throw new Error("API Key 格式不正确。");
        secret = await encryptSecret(apiKey, await getKey(), keyBinding(settings));
      } else if (secret?.binding !== keyBinding(settings)) {
        secret = null;
      }
      await chrome.storage.local.set({ settings, secret });
      return { hasKey: Boolean(secret) };
    } finally { saving = false; }
  }
  const scope = isOptions(sender) ? "options" : `${sender.tab?.id}:${sender.frameId ?? 0}`;
  if (message.type === "CANCEL") {
    const job = pending.get(scope);
    if (job?.id === message.requestId) job.controller.abort();
    return {};
  }
  if (message.type === "GENERATE") {
    if (typeof message.requestId !== "string" || message.requestId.length > 100) throw new Error("无效的请求标识。");
    if (pending.has(scope)) throw new Error("上一次请求尚未结束，请稍后重试。");
    const job = { id: message.requestId, controller: new AbortController() };
    pending.set(scope, job);
    const timer = setTimeout(() => job.controller.abort(), 25000);
    try {
      const { settings: raw, secret } = await readState();
      if (!secret) throw new Error("请先打开设置，填写模型 ID 并保存 API Key。");
      const settings = validateSettings(raw);
      if (!await chrome.permissions.contains({ origins: [`${new URL(settings.baseUrl).origin}/*`] })) throw new Error("API 网站访问权限已撤销，请在设置页重新保存并授权。");
      const apiKey = await decryptSecret(secret, await getKey(), keyBinding(settings));
      const comments = await generateComments(settings, apiKey, message.tweet, message.templateId || settings.activeTemplateId, { signal: job.controller.signal });
      return { comments };
    } finally { clearTimeout(timer); if (pending.get(scope) === job) pending.delete(scope); }
  }
  throw new Error("未知操作。");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message || {}, sender).then(data => sendResponse({ ok: true, ...data }), error => sendResponse({ ok: false, error: error.message || "操作失败，请重试。" }));
  return true;
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({
    id: "qingping-selection", title: "轻评：为选中文字生成评论", contexts: ["selection"],
    documentUrlPatterns: ["https://x.com/*", "https://www.x.com/*", "https://twitter.com/*", "https://www.twitter.com/*"]
  }));
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "qingping-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "SELECTION", text: info.selectionText }, { frameId: 0 }).catch(() => chrome.runtime.openOptionsPage());
  }
});
