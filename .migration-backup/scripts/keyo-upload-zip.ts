import { deflateRawSync } from "node:zlib";

export const KEYO_UPLOAD_FILENAME = "keyo-studio-github-upload.zip";
export const KEYO_SPACE_UPLOAD_FILENAME = "keyo-studio-huggingface-upload.zip";
export const KEYO_GIT_EXTRAS: Record<string, string> = {
  ".gitignore": "node_modules/\nnative/generated/\ndist/\nmodels/\nweights/\n*.safetensors\n*.gguf\n*.bin\n*.tgz\n*.tar.gz\n.env*\n**/api-token\n",
  ".github/workflows/tests.yml": `name: Runner checks
on: [push, pull_request]
permissions:
  contents: read
jobs:
  checks:
    strategy:
      matrix:
        node: [22, 24]
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: \${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
      - run: npm test
`,
};

// Small deterministic source ZIP. No filesystem traversal or executable hooks.
export function sourceZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  if (files.length > 1000) throw new Error("Too many source files.");
  const local: Buffer[] = [], central: Buffer[] = [];
  const seen = new Set<string>();
  let offset = 0, total = 0;
  for (const file of files) {
    if (!file.name || file.name.startsWith("/") || file.name.includes("\\") ||
      file.name.split("/").some(segment => !segment || segment === ".." || segment === "." || segment === ".git") ||
      seen.has(file.name)) throw new Error("Unsafe or duplicate ZIP path.");
    seen.add(file.name);
    total += file.data.length;
    if (total > 4 * 1024 * 1024) throw new Error("Source ZIP size limit exceeded.");
    const name = Buffer.from(file.name), packed = deflateRawSync(file.data);
    if (name.length > 65535) throw new Error("ZIP filename too long.");
    let crc = 0xffffffff;
    for (const byte of file.data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const date = (46 << 9) | (1 << 5) | 1; // 2026-01-01, reproducible archive timestamp.
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8);
    header.writeUInt16LE(date, 12); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE((3 << 8) | 20, 4); entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x800, 8); entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(date, 14); entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(((file.name === "bin/keyo.mjs" ? 0o100755 : 0o100644) << 16) >>> 0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
