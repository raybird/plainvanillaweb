# 原生檔案系統存取 (File System Access)

現代瀏覽器已具備與本地檔案系統直接溝通的能力，不再僅限於簡單的「上傳」與「下載」。

## 1. 存取本地目錄 (Directory Access)

透過 `window.showDirectoryPicker()`，應用程式可以向使用者請求特定資料夾的控制權。

```javascript
async function openFolder() {
    const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
    });
    console.log(`已開啟目錄: ${handle.name}`);
    return handle;
}
```

## 2. 檔案控制代碼 (FileSystemHandle)

獲取目錄控制權後，您可以遞迴遍歷檔案，或獲取特定檔案的控制代碼進行讀寫。

### 讀取檔案
```javascript
const file = await fileHandle.getFile();
const content = await file.text();
```

### 寫入檔案
```javascript
const writable = await fileHandle.createWritable();
await writable.write(newContent);
await writable.close();
```

## 3. 在 Playground 中的應用

本專案的「遊樂場」利用此 API 實作了「本地模式」：
1.  **自動偵測**：當您開啟目錄時，它會自動搜尋 `index.html`、`style.css` 與 `app.js`。
2.  **直接同步**：在瀏覽器中編輯後按下「儲存」，代碼會直接寫回您的硬碟檔案中。
3.  **零工具鏈**：這展示了如何只用瀏覽器就建立起完整的開發工作流。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
