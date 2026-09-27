import { mkdir, readFile, writeFile } from "node:fs/promises";
// Small dependency-free ZIP writer (stored entries, UTF-8 filenames).
const files = ["manifest.json", "background.js", "core.js", "vault.js", "tweet-dom.js", "content.js", "options.html", "options.js", "styles.css", "README.md"];
const crc32 = buffer => {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
};
const local = [], central = [];
let offset = 0;
for (const file of files) {
  const data = await readFile(file), name = Buffer.from(file), crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
  local.push(header, name, data);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8);
  directory.writeUInt16LE(33, 14); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
  central.push(directory, name); offset += header.length + name.length + data.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
await mkdir("dist", { recursive: true });
await writeFile("dist/qingping-1.0.0.zip", Buffer.concat([...local, directory, end]));
console.log(`Created dist/qingping-1.0.0.zip (${files.length} files; no credentials, tests or dependencies).`);
