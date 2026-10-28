# 課序

學校行程整理：課程、作業、考試、讀書進度。跑在 `lipang` 上，透過 Tailscale 讓自己的所有裝置共用同一份資料。

## 使用

在任何已登入 Tailscale 的裝置打開 <http://lipang:43127>（或 <http://100.124.35.79:43127>）。

## 資料

- 存在 `data/school.json`（每次寫入前會備份到 `school.json.bak`）
- 備份：直接複製 `data/` 資料夾即可

## 伺服器

以 systemd user service 執行（`~/.config/systemd/user/kexu.service`）：

```bash
systemctl --user status kexu      # 狀態
systemctl --user restart kexu     # 重啟
journalctl --user -u kexu -f      # 看 log
```

改完程式後：

```bash
npm run build && systemctl --user restart kexu
```

本機開發：`npm run dev`（<http://127.0.0.1:43127>）。注意它和正式服務讀寫的是同一個 `data/school.json`。
