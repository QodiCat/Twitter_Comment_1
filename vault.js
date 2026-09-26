const encoder = new TextEncoder();
const decoder = new TextDecoder();

// A non-extractable CryptoKey is persisted separately from ciphertext.
export async function deviceKey() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("qingping-vault", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("keys");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法打开本地密钥库。"));
  });
  try {
    const existing = await new Promise((resolve, reject) => {
      const request = db.transaction("keys").objectStore("keys").get("device");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("无法读取本地密钥库。"));
    });
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await new Promise((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      tx.objectStore("keys").put(key, "device");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(new Error("无法保存本地密钥库。"));
      tx.onabort = () => reject(new Error("密钥库写入已中止。"));
    });
    return key;
  } finally { db.close(); }
}

export async function encryptSecret(secret, key, binding) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(binding) }, key, encoder.encode(secret));
  return { version: 1, binding, iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
}

export async function decryptSecret(record, key, binding) {
  if (!record || record.version !== 1 || record.binding !== binding) throw new Error("请在设置页为当前服务保存 API Key。");
  try {
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv), additionalData: encoder.encode(binding) }, key, new Uint8Array(record.ciphertext));
    return decoder.decode(raw);
  } catch { throw new Error("本地密钥无法解密，请在设置页重新填写 API Key。"); }
}
