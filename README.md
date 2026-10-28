# 課序

學校行程整理：課程、作業、考試、讀書進度。以 PWA 形式發佈在 GitHub Pages，帳號與資料存在 Supabase。

## 安裝到 iPhone

1. 用 Safari 打開 <https://lfa-2.github.io/kexu/>
2. 點「分享」→「加入主畫面」
3. 註冊或登入帳號（Email + 密碼）

## 帳號與連結

- 每個帳號有一組 6 碼連結碼（右上角頭像 →「帳號與連結」）
- 輸入對方的連結碼送出邀請，對方接受後雙方可以互相查看所有頁面，但只能讀、不能改
- 兩人互相輸入對方的碼會直接完成連結；任何一方都能隨時取消連結
- 唯讀由資料庫的 Row Level Security 強制，不只是畫面上隱藏按鈕

## 資料

- 存在 Supabase（`public.school_data`，每人一列 JSON），登入同一帳號的裝置看到同一份
- 儲存時帶版本號，兩台裝置同時修改會在最新版本上重新套用，不會互相覆蓋
- 沒網路時可以看最後一次同步的內容，但修改不會被儲存
- 舊版（本機儲存）的資料會在該裝置第一次登入時自動上傳；也可用「匯入備份」匯入備份檔
- 目前沒有「忘記密碼」：需要另外設定 SMTP 寄信服務才能開啟

## 後端（Supabase）

- 專案：`kexu`（ap-northeast-1），schema 在 `supabase/migrations/`，Auth 設定在 `supabase/config.toml`
- 修改 schema：新增 migration 後執行 `npx supabase db push --linked`；修改設定：`npx supabase config push`
- 前端需要 `NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`：本機放 `.env.local`，GitHub Actions 讀 repo variables `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`

## 更新

推到 `main` 後，GitHub Actions 會自動建置並部署（`.github/workflows/deploy.yml`）。
使用者下次開啟 App 時會看到「課序有新版本」，點「立即更新」即可，資料不受影響。

更新偵測靠 `scripts/generate-sw.mjs` 在建置後產生的 `out/sw.js`：快取名稱是所有輸出檔案內容的雜湊，內容有變就會產生新版 service worker。

## 開發

```bash
npm install
npm run dev     # http://127.0.0.1:43127（開發模式不註冊 service worker）
npm run build   # 輸出靜態檔到 out/，預設 base path 為 /kexu
```
