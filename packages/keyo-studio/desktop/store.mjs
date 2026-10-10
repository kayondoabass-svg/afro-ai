import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const validId = id => typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
const LIMIT = 2 * 1024 * 1024;
export class ChatStore {
  constructor(directory) { this.directory = directory; this.queue = Promise.resolve(); }
  async init() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Conversation folder must be a real directory.');
    if (process.platform !== 'win32') await fs.chmod(this.directory, 0o700);
    // A crash must not leave history displaying indefinitely as generating.
    for (const summary of await this.list()) {
      const chat = await this.get(summary.id);
      if (chat.messages.some(m => m.status === 'generating')) {
        for (const m of chat.messages) if (m.status === 'generating') m.status = 'error';
        await this.put(chat);
      }
    }
    return this;
  }
  filename(id) {
    if (!validId(id)) throw new Error('Invalid conversation ID.');
    return path.join(this.directory, `${id}.json`);
  }
  async get(id) {
    const filename = this.filename(id);
    const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > LIMIT) throw new Error('Conversation file is invalid or exceeds 2 MiB.');
      const chat = JSON.parse(await handle.readFile('utf8'));
      if (chat.id !== id || typeof chat.title !== 'string' || !Array.isArray(chat.messages) || chat.messages.length > 512 ||
          chat.messages.some(m => !validId(m.id) || !['user','assistant'].includes(m.role) || typeof m.content !== 'string' ||
            !['complete','generating','cancelled','error'].includes(m.status))) throw new Error('Invalid conversation data.');
      return chat;
    } finally { await handle.close(); }
  }
  async put(chat) {
    const filename = this.filename(chat.id), data = JSON.stringify(chat);
    if (Buffer.byteLength(data) > LIMIT || chat.messages.length > 512) throw new Error('Conversation is full. Start a new one.');
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temporary, 'wx', 0o600);
      try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(temporary, filename);
    } catch (error) { await fs.rm(temporary, { force: true }); throw error; }
    return chat;
  }
  serialize(action) {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }
  async list() {
    const files = (await fs.readdir(this.directory)).filter(name => validId(name.replace(/\.json$/, '')) && name.endsWith('.json'));
    if (files.length > 200) throw new Error('More than 200 conversations found; archive some outside this app.');
    const chats = await Promise.all(files.map(async file => this.get(file.slice(0,-5))));
    return chats.map(({id,title,createdAt,updatedAt,messages}) => ({id,title,createdAt,updatedAt,messageCount:messages.length}))
      .sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  create() {
    return this.serialize(async () => {
      if ((await this.list()).length >= 200) throw new Error('Conversation limit reached. Delete or archive a conversation.');
      const now = new Date().toISOString();
      return this.put({id:randomUUID(),title:'New conversation',createdAt:now,updatedAt:now,messages:[]});
    });
  }
  update(id, update) {
    return this.serialize(async () => {
      const chat = await this.get(id); await update(chat);
      chat.updatedAt = new Date().toISOString(); return this.put(chat);
    });
  }
  rename(id, title) {
    if (typeof title !== 'string' || !title.trim() || title.length > 100) throw new Error('Use a title of 1–100 characters.');
    return this.update(id, chat => { chat.title = title.trim(); });
  }
  remove(id) { return this.serialize(() => fs.unlink(this.filename(id))); }
}
