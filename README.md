# 伸脖羊飛臺北

點一下讓羊頭往上跳（按越久跳越高），身體留在原地，脖子一路伸長穿過 100 種臺北地標。

開始畫面和結束畫面會顯示「已被玩幾次・幾人玩過」。

- **次數**：每次從開始畫面點下去開始一局，就算一次。
- **人數**：每台裝置的每個瀏覽器第一次打開時算一人。清掉瀏覽器資料或換瀏覽器，會再算一次。

**全域排行榜**：死掉後可以輸入名字（最多 12 字）上傳分數。開始畫面和結束畫面都有「🏆 排行榜」按鈕，可以看前 20 名，自己那一列會反白。每台裝置只保留最高分；名字可以改，但分數只會往上更新。

---

## 一、建立 Firebase 資料庫（存統計數字，免費）

1. 到 https://console.firebase.google.com ，按「建立專案」，名字隨意（例如 `sheep-game`）。Google Analytics 可以關掉。
2. 左側選單 **建構 → Realtime Database → 建立資料庫**。
   - 位置選 **新加坡（asia-southeast1）**，離臺灣最近。
   - 安全性規則選 **以鎖定模式啟動**。
3. 進入 Realtime Database 的 **規則** 分頁，把裡面的內容全部換成 `database.rules.json` 的內容，再按 **發布**。
   - 這組規則讓所有人都能讀統計數字和排行榜；統計每次只能加 1、不能歸零；排行榜每台裝置一筆，名字限 1–12 字，分數只能往上更新。
   - 之後如果改過規則，一樣要把新的 `database.rules.json` 整份貼上再發布一次。
   - 想刪掉不雅名字：在 Realtime Database 頁面點開 `leaderboard`，找到那一筆刪除即可。
4. 回到專案首頁，按齒輪 **專案設定 → 一般**，往下找「你的應用程式」，按網頁圖示 **`</>`**，隨便取個名字註冊（不用勾 Hosting）。
5. 畫面會出現一段 `firebaseConfig`。把其中這五個值，貼進 `index.html` 最下面的 `window.FIREBASE_CONFIG` 對應欄位：
   - `apiKey`
   - `authDomain`
   - `databaseURL`
   - `projectId`
   - `appId`

   如果沒看到 `databaseURL`，到 Realtime Database 頁面最上方複製網址（`https://…firebasedatabase.app`）。

> 網頁用的 `apiKey` 本來就會出現在前端，不是密碼，可以放心公開；真正保護資料的是第 3 步的規則。
>
> 沒有填設定的話，遊戲照樣能玩，只是不會顯示統計。

## 二、放上 GitHub Pages（免費網址）

1. 到 https://github.com/new 建立新的 repository，例如 `sheep-game`，選 **Public**。
2. 在 repository 頁面按 **Add file → Upload files**，把 `index.html` 拖進去（`README.md`、`database.rules.json` 要不要一起放都可以），按 **Commit changes**。
3. 到 **Settings → Pages**：
   - Source 選 **Deploy from a branch**
   - Branch 選 **main**、資料夾選 **/ (root)**，按 **Save**
4. 等一兩分鐘，網址會是：`https://kenneth0604.github.io/long-neck-sheep/`

之後要改遊戲，只要重新上傳 `index.html` 覆蓋即可，網址不變，統計數字也會保留。

## 三、查看統計

- 直接打開遊戲網址，開始畫面就會顯示。
- 也可以在 Firebase 的 Realtime Database 頁面看到 `stats/plays`（次數）、`stats/players`（人數）和 `leaderboard`（排行榜）。

> 分數是由玩家的瀏覽器上傳的，懂程式的人有辦法偽造高分。這是純前端小遊戲的限制，看到明顯作弊的紀錄，直接在 Firebase 刪掉就好。
