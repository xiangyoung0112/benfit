// ============================================================
// GAS API 函式集合
// ============================================================

// 保存 GAS URL
function saveGASUrl() {
  const url = document.getElementById('gasUrl').value.trim();
  if (!url) {
    showToast('請輸入 GAS URL', 'fail');
    return;
  }
  localStorage.setItem('gasUrl', url);
  gasUrl = url;
  showToast('已儲存 GAS URL', 'ok');
  testGAS();
}

// 測試 GAS 連線
async function testGAS() {
  const url = document.getElementById('gasUrl').value.trim();
  if (!url) {
    showToast('請先輸入 GAS URL', 'fail');
    updateGASStatus('err');
    return;
  }

  showLoading('測試連線中...');
  try {
    const response = await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test' })
    });
    hideLoading();
    updateGASStatus('ok');
    showToast('GAS 連線成功', 'ok');
  } catch (e) {
    hideLoading();
    updateGASStatus('err');
    showToast('GAS 連線失敗: ' + e.message, 'fail');
    console.error('GAS 連線錯誤:', e);
  }
}

// 更新 GAS 狀態指示
function updateGASStatus(status) {
  const dot = document.getElementById('gasStatus');
  if (dot) {
    dot.className = 'status-dot ' + (status === 'ok' ? 'ok' : 'err');
  }
}

// 從 GAS 載入帳本數據
async function loadLedgerFromGAS() {
  if (!gasUrl) {
    showToast('未設定 GAS URL', 'fail');
    return;
  }

  showLoading('從 GAS 載入帳本...');
  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getLedger' })
    });

    // 因為 no-cors 模式限制，無法直接讀取響應
    // 改用 JSONP 或其他方式
    const data = await response.json().catch(() => null);
    
    if (data && data.ledger) {
      ledger = data.ledger;
      renderLedger();
      showToast('已從 GAS 載入帳本', 'ok');
    } else {
      console.warn('GAS 未返回有效數據');
    }
    hideLoading();
  } catch (e) {
    hideLoading();
    console.error('載入帳本失敗:', e);
    showToast('無法從 GAS 載入帳本', 'fail');
  }
}

// 從 GAS 載入股票數據
async function loadStocksFromGAS() {
  if (!gasUrl) {
    console.warn('未設定 GAS URL，使用內建數據');
    return;
  }

  showLoading('從 GAS 載入股票數據...');
  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getStocks' })
    });

    const data = await response.json().catch(() => null);
    
    if (data && data.stocks && Array.isArray(data.stocks)) {
      data.stocks.forEach(s => {
        const idx = STOCKS_RAW.findIndex(x => x['代號'] === s['代號']);
        if (idx >= 0) {
          STOCKS_RAW[idx] = { ...STOCKS_RAW[idx], ...s };
        } else {
          STOCKS_RAW.push(s);
        }
        if (s['現價']) livePrices[s['代號']] = s['現價'];
      });
      buildCatTabs();
      renderPerf();
      showToast('已從 GAS 更新股票數據', 'ok');
    }
    hideLoading();
  } catch (e) {
    hideLoading();
    console.error('載入股票數據失敗:', e);
    // 不顯示錯誤提示，使用內建數據
  }
}

// 推送帳本到 GAS
async function pushLedgerToGAS() {
  if (!gasUrl) {
    console.warn('未設定 GAS URL，無法推送');
    return;
  }

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'saveLedger',
        ledger: ledger
      })
    });

    console.log('帳本已推送到 GAS');
  } catch (e) {
    console.error('推送帳本失敗:', e);
  }
}

// 保存今日價格到 GAS
async function saveTodayPricesToGAS(stocks, dateStr) {
  if (!gasUrl) return;

  try {
    const prices = {};
    stocks.forEach(s => {
      prices[s['代號']] = livePrices[s['代號']] || s['現價'];
    });

    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'savePrices',
        date: dateStr,
        prices: prices
      })
    });

    console.log('價格已保存到 GAS');
  } catch (e) {
    console.error('保存價格失敗:', e);
  }
}

// 同步到 GAS (從頭部按鈕調用)
async function syncToGAS() {
  if (!gasUrl) {
    showToast('請先設定 GAS URL', 'fail');
    return;
  }

  showLoading('同步中...');
  try {
    await pushLedgerToGAS();
    const data = getFilteredStocks();
    const today = new Date().toISOString().split('T')[0];
    await saveTodayPricesToGAS(data, today);
    hideLoading();
    showToast('已同步到 GAS', 'ok');
  } catch (e) {
    hideLoading();
    showToast('同步失敗: ' + e.message, 'fail');
  }
}

// ============================================================
// 文件上傳函式
// ============================================================

async function uploadDataFile() {
  const file = document.getElementById('dataFile').files[0];
  if (!file) {
    showToast('請選擇檔案', 'fail');
    return;
  }

  showLoading('上傳並解析檔案...');
  const statusDiv = document.getElementById('uploadStatus');
  
  try {
    let data;
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'json') {
      const text = await file.text();
      data = JSON.parse(text);
    } else if (ext === 'csv') {
      data = await parseCSV(file);
    } else if (['xlsx', 'xls'].includes(ext)) {
      data = await parseXLSX(file);
    } else {
      throw new Error('不支持的檔案格式');
    }

    if (Array.isArray(data)) {
      // 合併數據到 STOCKS_RAW
      data.forEach(item => {
        const idx = STOCKS_RAW.findIndex(x => x['代號'] === item['代號']);
        if (idx >= 0) {
          STOCKS_RAW[idx] = { ...STOCKS_RAW[idx], ...item };
        } else {
          STOCKS_RAW.push(item);
        }
        if (item['現價']) livePrices[item['代號']] = item['現價'];
      });

      buildCatTabs();
      renderPerf();
      hideLoading();
      statusDiv.innerHTML = `<span style="color:var(--green);">✓ 已導入 ${data.length} 筆數據</span>`;
      showToast('檔案上傳成功', 'ok');
      
      if (gasUrl) {
        await loadStocksFromGAS();
      }
    } else {
      throw new Error('檔案格式無效');
    }
  } catch (e) {
    hideLoading();
    statusDiv.innerHTML = `<span style="color:var(--red);">✗ 錯誤: ${e.message}</span>`;
    showToast('檔案上傳失敗: ' + e.message, 'fail');
    console.error('檔案上傳錯誤:', e);
  }
}

// 解析 CSV 文件
async function parseCSV(file) {
  const text = await file.text();
  const lines = text.split('\n');
  if (lines.length < 2) throw new Error('CSV 為空');

  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = lines[i].split(',').map(v => v.trim());
    const item = {};
    headers.forEach((h, idx) => {
      item[h] = isNaN(row[idx]) ? row[idx] : parseFloat(row[idx]);
    });
    data.push(item);
  }
  
  return data;
}

// 解析 XLSX 文件
async function parseXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('讀取檔案失敗'));
    reader.readAsArrayBuffer(file);
  });
}

// ============================================================
// GAS 程式碼管理
// ============================================================

const GAS_TEMPLATE = `
// Google Apps Script - 貼入至 GAS 編輯器
function doPost(e) {
  const action = e.parameter.action;
  
  try {
    if (action === 'test') {
      return ContentService.createTextOutput(JSON.stringify({success: true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'getLedger') {
      const sheet = SpreadsheetApp.getActiveSheet();
      const data = sheet.getRange('A1:Z1000').getValues();
      return ContentService.createTextOutput(JSON.stringify({
        ledger: parseLedgerData(data)
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'getStocks') {
      const sheet = SpreadsheetApp.getActiveSheet();
      const data = sheet.getRange('A1:Z1000').getValues();
      return ContentService.createTextOutput(JSON.stringify({
        stocks: parseStocksData(data)
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'saveLedger') {
      const ledger = JSON.parse(e.postData.contents).ledger;
      saveLedgerToSheet(ledger);
      return ContentService.createTextOutput(JSON.stringify({success: true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({error: 'Unknown action'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function parseLedgerData(data) {
  const ledger = {};
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) break;
    const date = data[i][0].toString();
    if (!ledger[date]) ledger[date] = [];
    ledger[date].push({
      date: date,
      code: data[i][1],
      name: data[i][2],
      cat: data[i][3],
      buyPrice: parseFloat(data[i][4]),
      shares: parseInt(data[i][5]),
      score: parseFloat(data[i][6])
    });
  }
  return ledger;
}

function parseStocksData(data) {
  const stocks = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) break;
    stocks.push({
      '代號': data[i][0],
      '名稱': data[i][1],
      '貝氏評分': parseFloat(data[i][2]),
      '分類': data[i][3],
      '現價': parseFloat(data[i][4]),
      '漲幅': data[i][5]
    });
  }
  return stocks;
}

function saveLedgerToSheet(ledger) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const rows = [];
  Object.entries(ledger).forEach(([date, entries]) => {
    entries.forEach(e => {
      rows.push([e.date, e.code, e.name, e.cat, e.buyPrice, e.shares, e.score]);
    });
  });
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 7).setValues(rows);
  }
}
`;

function renderGASCode() {
  document.getElementById('gasCode').value = GAS_TEMPLATE;
}

function copyGASCode() {
  const textarea = document.getElementById('gasCode');
  textarea.select();
  document.execCommand('copy');
  showToast('已複製到剪貼板', 'ok');
}

function enableEditGAS() {
  const textarea = document.getElementById('gasCode');
  textarea.disabled = false;
  document.getElementById('updateGASBtn').style.display = 'flex';
  showToast('編輯模式已啟用', 'ok');
}

function updateGASCode() {
  showToast('請將更新後的代碼貼入 GAS 編輯器並重新部署', 'ok');
}

// ============================================================
// 清除快取
// ============================================================

function clearCache() {
  if (!confirm('確定要清除所有本地數據嗎？此動作無法復原。')) return;
  
  localStorage.clear();
  ledger = {};
  livePrices = {};
  manualSelected = new Set();
  
  renderLedger();
  renderPerf();
  showToast('已清除快取', 'ok');
}

// ============================================================
// 加載和隱藏載入提示
// ============================================================

function showLoading(text) {
  document.getElementById('loadingOverlay').classList.add('show');
  if (text) document.getElementById('loadingText').textContent = text;
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}

// ============================================================
// 吐司提示
// ============================================================

function showToast(message, type = 'ok') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type + ' show';
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}
