# 課序

學校行程整理：課程、作業、考試、讀書進度。以 PWA 形式發佈在 GitHub Pages，資料只存在使用者自己的裝置上。

## 安裝到 iPhone

1. 用 Safari 打開 <https://lfa-2.github.io/kexu/>
2. 點「分享」→「加入主畫面」

之後從主畫面開啟即可，離線也能用。

## 資料

- 存在裝置本機（`localStorage`，key `kexu-school-v1`），沒有伺服器、沒有跨裝置同步
- 刪除 App 或清除 Safari 網站資料會一併刪除資料，請用頁面底部的「匯出備份」定期備份
- 「匯入備份」可讀取本 App 的備份檔，也能讀取舊版伺服器的 `data/school.json`
- 網址（GitHub 帳號名稱與 repo 名稱）改變等於換了資料空間，原本的資料不會跟過去

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
