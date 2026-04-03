# APK.tw & Bingfong Auto Check-in

<p align="center">
  <img src="icons/icon128.png" width="100" alt="Extension Icon" />
</p>

<p align="center">
  輕量化 Chrome 擴充功能 — 每日自動簽到 <a href="https://apk.tw">APK.tw</a> 與 <a href="https://bingfong.com">Bingfong.com</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Version-1.6-green" alt="Version 1.6" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License" />
  <img src="https://img.shields.io/badge/Chrome-Extension-red?logo=googlechrome&logoColor=white" alt="Chrome Extension" />
</p>

## Screenshot

<p align="center">
  <img src="screenshots/screenshot_store_1280x800.png" width="640" alt="Screenshot" />
</p>

## Features

- 每日自動在指定時間簽到 [APK.tw](https://apk.tw) 與 [Bingfong.com](https://bingfong.com)
- 自訂簽到時間（預設 00:01）
- 可分別開啟 / 關閉各網站的簽到功能
- 支援瀏覽器背景執行，關閉視窗後仍可自動簽到（最小化視窗自動建立）
- 簽到成功後自動重新整理頁面
- 智慧視窗管理：有視窗時開背景分頁，無視窗時自動建立最小化視窗
- 透過 URL hash (`#auto-checkin`) 區分排程觸發與手動瀏覽

## Tech Stack

| 項目 | 技術 |
|------|------|
| 平台 | Chrome Extension (Manifest V3) |
| 排程 | Chrome Alarms API |
| 儲存 | Chrome Storage Sync API |
| 背景執行 | Service Worker + `background` 權限 |
| 內容注入 | Content Scripts (`document_idle`) |
| 簽到偵測 | DOM 元素點擊 + URL hash 辨識 |

## Architecture

```
checkin-extension/
├── manifest.json       # 擴充功能設定（Manifest V3）
├── background.js       # Service Worker — 排程管理 + 視窗管理
├── content.js          # Content Script — 頁面簽到邏輯
├── popup.html          # 設定介面 UI（macOS 風格）
├── popup.js            # 設定介面邏輯 + GitHub 頭像載入
├── icons/              # 擴充功能圖示 (16/48/128px)
└── screenshots/        # Chrome Web Store 截圖
```

### 運作流程

```mermaid
flowchart LR
    A[background.js<br/>Chrome Alarms] -->|時間到| B{有開啟的視窗?}
    B -->|是| C[開啟背景分頁]
    B -->|否| D[建立最小化視窗]
    C --> E[content.js<br/>自動點擊簽到按鈕]
    D --> E
    E -->|排程觸發| F[5 秒後重新整理]
    E -->|手動瀏覽| G[僅顯示成功訊息]
    H[popup.js<br/>使用者設定] -->|儲存| A

    style A fill:#007aff,color:#fff
    style E fill:#34c759,color:#fff
    style H fill:#ff9f0a,color:#fff
```

## Installation

### 方法一：開發者模式安裝

1. 下載或 Clone 此專案
   ```bash
   git clone https://github.com/keezxc1223/APK.tw-Bingfong-Auto-check-in.git
   ```
2. 開啟 Chrome，前往 `chrome://extensions/`
3. 右上角開啟 **開發人員模式**
4. 點擊 **載入未封裝項目**，選擇專案資料夾

### 方法二：Chrome Web Store

> 若已上架，可直接從 Chrome 線上應用程式商店安裝。

## Usage

1. 點擊工具列的擴充功能圖示
2. 設定每日簽到時間
3. 勾選想要自動簽到的網站（APK.tw / Bingfong）
4. 按下 **儲存設定** 即完成

## Configuration

| 設定項目 | 預設值 | 說明 |
|----------|--------|------|
| 簽到時間 | `00:01` | 每日自動簽到的時間（24 小時制） |
| APK.tw | 開啟 | 是否自動簽到 APK.tw |
| Bingfong | 開啟 | 是否自動簽到 Bingfong.com |

## Permissions

| 權限 | 用途 |
|------|------|
| `alarms` | 排程每日簽到任務 |
| `storage` | 儲存使用者設定（簽到時間、開關） |
| `background` | 允許瀏覽器關閉後持續背景執行 |
| `host_permissions` | 存取 apk.tw / bingfong.com 進行簽到操作 |

## Changelog

### v1.6
- 移除 `MAIN` world 注入，改用預設 Content Script 執行環境
- Content Script 匹配範圍擴大至整站（`*://apk.tw/*`），不再限於 `forum.php`
- 透過 URL hash (`#auto-checkin`) 區分排程觸發與手動瀏覽
- 排程觸發時自動重整頁面，手動瀏覽僅顯示成功訊息
- 移除 `localStorage` 防重複機制，改由 hash 判斷
- 新增 `background` 權限，支援瀏覽器關閉後背景執行
- 智慧視窗管理：有視窗開背景分頁，無視窗建最小化視窗

### v1.3
- 初始版本
- 支援 APK.tw / Bingfong.com 自動簽到
- Content Script 使用 `MAIN` world 注入
- `localStorage` 防重複簽到

## Notes

- 需先在瀏覽器中登入 [APK.tw](https://apk.tw) / [Bingfong.com](https://bingfong.com) 帳號，擴充功能才能正常簽到
- 若希望瀏覽器關閉後仍可簽到，請至 Chrome 設定 → 進階 → 系統，開啟「**Google Chrome 關閉時繼續執行背景應用程式**」
- 簽到成功後會自動在 5 秒後重新整理頁面（僅排程觸發時）

## License

MIT License
