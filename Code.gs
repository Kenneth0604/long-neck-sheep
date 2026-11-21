/**
 * @OnlyCurrentDoc   ← 只允許存取這一份試算表，碰不到你雲端硬碟裡的其他檔案
 *
 * 伸脖羊飛臺北：統計＋全域排行榜後端（Google Apps Script）
 * 資料存在這份 Google 試算表裡（在你的雲端硬碟）。
 *   工作表「stats」：A2 = 遊玩次數、B2 = 遊玩人數
 *   工作表「leaderboard」：裝置ID | 名字 | 分數 | 時間 | 檢查（可疑的會寫原因）
 *
 * 防作弊：開局時發一張一次性的票（存在 CacheService，6 小時有效），上傳分數要帶票；
 * 伺服器用開局到上傳的時間算出「這個分數最快要玩多久」，太快就拒收；
 * 點擊是程式產生的、或間隔精準得不像人，就在「檢查」欄標記，由擁有者決定要不要刪。
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
const boardSheet_ = () => { const sh = sheet_('leaderboard', ['裝置ID', '名字', '分數', '時間', '檢查']);
  if (!sh.getRange(1, 5).getValue()) sh.getRange(1, 5).setValue('檢查'); return sh; };

// ---- anti-cheat ----
// Fastest possible run: every obstacle 330 px apart, base speed 160 px/s × game speed-up × 1.7 (as if always dashing).
// The game clamps each frame to 33 ms, so game time never runs ahead of real time.
function minSeconds_(score) {
  let t = 420 / (160 * 1.7);
  for (let k = 1; k < score; k++) t += 330 / (160 * (1 + 0.2 * Math.log(1 + k / 6)) * 1.7);
  return t;
}
// The game asks 「我不是機器人」 first at a score between 20 and 35, then every 35–50 more,
// so a run of this score must have passed at least this many checks.
function checksNeeded_(score) { return score < 35 ? 0 : 1 + Math.floor((score - 35) / 50); }
const cache_ = () => CacheService.getScriptCache();
function newTicket_(pid) {
  const ticket = Utilities.getUuid();
  cache_().put('t_' + ticket, JSON.stringify({ pid: pid, t: Date.now() }), 21600);
  return ticket;
}
function flagsFor_(score, secs, run) {
  const out = [], r = run || {};
  if (Number(r.fake) > 0) out.push('程式點擊 ' + Number(r.fake) + ' 次');
  if (Number(r.taps) >= 20 && Number(r.cv) < 0.05) out.push('點擊間隔過度規律 cv=' + Number(r.cv));
  if (score >= 10 && Number(r.taps) < score * 0.5) out.push('點擊次數太少 ' + Number(r.taps));
  if (Number(r.checkFake) > 0) out.push('驗證被程式點擊 ' + Number(r.checkFake) + ' 次');
  const fast = (Array.isArray(r.checkMs) ? r.checkMs : []).filter(ms => Number(ms) < 300).length;
  if (fast) out.push('驗證反應過快 ' + fast + ' 次');
  if (secs < minSeconds_(score) * 1.3) out.push('速度接近上限 ' + Math.round(secs) + ' 秒');
  return out.join('；');
}

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
    if (action === 'start')  { bump_(1); const o = readStats_(); const pid = cleanPid_(p.pid); if (pid) o.ticket = newTicket_(pid); return o; }
    if (action === 'player') { bump_(2); return readStats_(); }
    if (action === 'submit') {
      // strip characters a spreadsheet would treat as a formula (=, +, -, @) and control characters
      const name = String(p.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/^[=+\-@\s]+/, '').slice(0, MAX_NAME);
      const pid = cleanPid_(p.pid), score = Math.floor(Number(p.score));
      if (!pid || !name || !(score >= 1 && score <= MAX_SCORE)) return { error: 'bad input' };
      const key = 't_' + String(p.ticket || '').replace(/[^A-Za-z0-9-]/g, ''), raw = cache_().get(key);
      if (!raw) return { error: 'ticket' };                              // no run started, already used, or expired
      const tk = JSON.parse(raw); cache_().remove(key);
      if (tk.pid !== pid) return { error: 'ticket' };
      const secs = (Date.now() - tk.t) / 1000;
      if (secs < minSeconds_(score) * 0.9) return { error: 'rejected' };   // faster than the game allows
      if (Number((p.run || {}).checks || 0) < checksNeeded_(score)) return { error: 'robot' };   // skipped the 「我不是機器人」 check
      const flag = flagsFor_(score, secs, p.run);
      const all = rows_(), mine = all.find(r => r.pid === pid);
      if (!mine && all.length >= MAX_ROWS) return { error: 'leaderboard full' };   // stop endless spam rows
      if (mine && mine.score > score) return { saved: false, best: mine.score, rank: rankOf_(mine.score) };
      const values = [[pid, name, score, new Date(), flag]];
      if (mine) boardSheet_().getRange(mine.row, 1, 1, 5).setValues(values); else boardSheet_().appendRow(values[0]);
      return { saved: true, rank: rankOf_(score) };
    }
    return { error: 'unknown action' };
  } finally { lock.releaseLock(); }
}
const out_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
function doGet(e)  { return out_(handle_(e.parameter || {})); }
function doPost(e) { let p = {}; try { p = JSON.parse(e.postData.contents); } catch (_) {} return out_(handle_(p)); }
