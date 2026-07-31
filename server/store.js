/**
 * store.js — 后端持久化层（JSON 落盘，零外部依赖）
 * 每个对局一个文件：data/saves/<id>.json；当前活动对局指针：data/active.json
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, 'data');
const SAVES_DIR = path.join(DATA_DIR, 'saves');
const ACTIVE_FILE = path.join(DATA_DIR, 'active.json');

function ensure() {
  if (!fs.existsSync(SAVES_DIR)) fs.mkdirSync(SAVES_DIR, { recursive: true });
}
function write(id, g) {
  ensure();
  fs.writeFileSync(path.join(SAVES_DIR, id + '.json'), JSON.stringify(g));
}
function read(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(SAVES_DIR, id + '.json'), 'utf8'));
  } catch (e) {
    return null;
  }
}
function list() {
  ensure();
  return fs.readdirSync(SAVES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}
function remove(id) {
  try { fs.unlinkSync(path.join(SAVES_DIR, id + '.json')); } catch (e) {}
}

function setActive(id) {
  fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ id: id || null, at: Date.now() }));
}
function getActive() {
  try { return JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8')).id || null; }
  catch (e) { return null; }
}

module.exports = { write, read, list, remove, setActive, getActive, DATA_DIR, SAVES_DIR };
