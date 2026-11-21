/**
 * @OnlyCurrentDoc   ← 只允許存取這一份試算表，碰不到你雲端硬碟裡的其他檔案
 *
 * 伸脖羊飛臺北：統計＋全域排行榜後端（Google Apps Script）
 * 資料存在這份 Google 試算表裡（在你的雲端硬碟）。
 *   工作表「stats」：A2 = 遊玩次數、B2 = 遊玩人數
 *   工作表「leaderboard」：裝置ID | 名字 | 分數 | 時間
 * 部署成「網頁應用程式」後，把網址貼進 index.html 的 SHEET_API。
 */
const MAX_NAME = 12, MAX_SCORE = 9999, MAX_ROWS = 5000;

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); }
  return sh;
}
const statsSheet_ = () => sheet_('stats', ['遊玩次數', '遊玩人數']);
const boardSheet_ = () => sheet_('leaderboard', ['裝置ID', '名字', '分數', '時間']);

function readStats_() {
  const v = statsSheet_().getRange(2, 1, 1, 2).getValues()[0];
  return { plays: Number(v[0]) || 0, players: Number(v[1]) || 0 };
}
function bump_(col) {           // col 1 = plays, 2 = players
  const r = statsSheet_().getRange(2, col);
  r.setValue((Number(r.getValue()) || 0) + 1);
}
function rows_() {
  const sh = boardSheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 4).getValues().map((r, i) => ({ row: i + 2, pid: String(r[0]), name: String(r[1]), score: Number(r[2]) || 0, ts: +new Date(r[3]) || 0 }));
}
function sorted_() { return rows_().sort((a, b) => b.score - a.score || a.ts - b.ts); }
function rankOf_(score) { return rows_().filter(r => r.score > score).length + 1; }
const cleanPid_ = p => String(p || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);

function handle_(p) {
  const action = String(p.action || '');
  if (action === 'stats') return readStats_();
  if (action === 'top') {
    const pid = cleanPid_(p.pid), n = Math.min(50, Math.max(1, Number(p.n) || 20));
    return { rows: sorted_().slice(0, n).map(r => ({ name: r.name, score: r.score, me: !!pid && r.pid === pid })) };
  }
  // writes: one at a time
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (action === 'start')  { bump_(1); return readStats_(); }
    if (action === 'player') { bump_(2); return readStats_(); }
    if (action === 'submit') {
      // strip characters a spreadsheet would treat as a formula (=, +, -, @) and control characters
      const name = String(p.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/^[=+\-@\s]+/, '').slice(0, MAX_NAME);
      const pid = cleanPid_(p.pid), score = Math.floor(Number(p.score));
      if (!pid || !name || !(score >= 1 && score <= MAX_SCORE)) return { error: 'bad input' };
      const all = rows_(), mine = all.find(r => r.pid === pid);
      if (!mine && all.length >= MAX_ROWS) return { error: 'leaderboard full' };   // stop endless spam rows
      if (mine && mine.score > score) return { saved: false, best: mine.score, rank: rankOf_(mine.score) };
      const values = [[pid, name, score, new Date()]];
      if (mine) boardSheet_().getRange(mine.row, 1, 1, 4).setValues(values); else boardSheet_().appendRow(values[0]);
      return { saved: true, rank: rankOf_(score) };
    }
    return { error: 'unknown action' };
  } finally { lock.releaseLock(); }
}
const out_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
function doGet(e)  { return out_(handle_(e.parameter || {})); }
function doPost(e) { let p = {}; try { p = JSON.parse(e.postData.contents); } catch (_) {} return out_(handle_(p)); }
