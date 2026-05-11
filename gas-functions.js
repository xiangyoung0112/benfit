// ============================================================
// GAS API 函式集合 - 已修復 CORS 問題
// ============================================================

// 保存 GAS URL
function saveGASUrl() {
  const url = document.getElementById('gasUrl').value.trim();
  if (!url) {
    showToast('請輸入 GAS URL', 'fail');
    return;
  }
  
  // 驗證 URL 格式
  if (!url.includes('script.google.com')) {
    showToast('請輸入有效的 GAS URL', 'fail');
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
    // 構建 URL 參數方式 (避免 no-cors 限制)
    const testUrl = url + '?action=test&t=' + Date.now();
    const response = await fetch(testUrl, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    
    const data = await response.json();
    hideLoading();
    
    if (data.success || data.message) {
      updateGASStatus('ok');
      showToast('GAS 連線成功 ✓', 'ok');
    } else {
      throw new Error(data.error || 'Unknown response');
    }
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

// 從 GAS 載入帳本數據 - 已修復
async function loadLedgerFromGAS() {
  if (!gasUrl) {
    console.warn('未設定 GAS URL');
    return;
  }

  showLoading('從 GAS 載入帳本...');
  try {
    // 使用 GET 請求搭配 URL 參數 (避免 CORS 預檢)
    const url = gasUrl + '?action=getLedger&t=' + Date.now();
    const response = await fetch(url, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ': ' + response.statusText);
    }
    
    const data = await response.json();
    
    if (data.ledger && typeof data.ledger === 'object') {
      ledger = data.ledger;
      renderLedger();
      buildChartLedgerTabs();
      updateSaveLedgerSelect();
      showToast('✓ 已從 GAS 載入帳本', 'ok');
    } else if (data.error) {
      console.warn('GAS 返回錯誤:', data.error);
      showToast('GAS 錯誤: ' + data.error, 'fail');
    }
    hideLoading();
  } catch (e) {
    hideLoading();
    console.error('載入帳本失敗:', e);
    showToast('無法從 GAS 載入帳本: ' + e.message, 'fail');
  }
}

// 從 GAS 載入股票數據 - 已修復
async function loadStocksFromGAS() {
  if (!gasUrl) {
    console.warn('未設定 GAS URL，使用內建數據');
    return;
  }

  showLoading('從 GAS 載入股票數據...');
  try {
    // 使用 GET 請求搭配 URL 參數
    const url = gasUrl + '?action=getStocks&t=' + Date.now();
    const response = await fetch(url, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    
    const data = await response.json();
    
    if (data.stocks && Array.isArray(data.stocks) && data.stocks.length > 0) {
      // 合併數據
      data.stocks.forEach(s => {
        const idx = STOCKS_RAW.findIndex(x => x['代號'] === s['代號']);
        if (idx >= 0) {
          // 保留原有欄位，更新 GAS 提供的欄位
          STOCKS_RAW[idx] = { ...STOCKS_RAW[idx], ...s };
        } else {
          STOCKS_RAW.push(s);
        }
        if (s['現價']) livePrices[s['代號']] = s['現價'];
      });
      
      buildCatTabs();
      renderPerf();
      console.log('✓ 已從 GAS 載入 ' + data.stocks.length + ' 檔股票');
      // 不顯示 toast，避免打擾用戶
    } else if (data.stocks && data.stocks.length === 0) {
      console.warn('GAS 未返回股票數據，使用內建數據');
    } else if (data.error) {
      console.warn('GAS 錯誤:', data.error);
    }
    hideLoading();
  } catch (e) {
    hideLoading();
    console.error('載入股票數據失敗:', e);
    // 不顯示錯誤提示，使用內建數據
  }
}

// 推送帳本到 GAS - 已修復
async function pushLedgerToGAS() {
  if (!gasUrl) {
    console.warn('未設定 GAS URL，無法推送');
    return;
  }

  try {
    // 使用 POST 請求並在 URL 中帶參數
    const url = gasUrl + '?action=saveLedger';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        action: 'saveLedger',
        ledger: ledger
      })
    });
    
    const data = await response.json();
    
    if (data.success || data.message) {
      console.log('✓ 帳本已推送到 GAS');
    } else if (data.error) {
      console.error('GAS 返回錯誤:', data.error);
    }
  } catch (e) {
    console.error('推送帳本失敗:', e);
  }
}

// 保存今日價格到 GAS - 已修復
async function saveTodayPricesToGAS(stocks, dateStr) {
  if (!gasUrl) return;

  try {
    const prices = {};
    stocks.forEach(s => {
      prices[s['代號']] = livePrices[s['代號']] || s['現價'];
    });

    const url = gasUrl + '?action=savePrices';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'savePrices',
        date: dateStr,
        prices: prices
      })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('✓ 價格已保存到 GAS');
    } else if (data.error) {
      console.error('GAS 返回錯誤:', data.error);
    }
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
    showToast('✓ 已同步到 GAS', 'ok');
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
      throw new Error('不支持的檔案格式: ' + ext);
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
      showToast('✓ 檔案上傳成功', 'ok');
      
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
        if (!sheetName) {
          reject(new Error('XLSX 檔案中沒有工作表'));
          return;
        }
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
// Google Apps Script - 台股績效系統後端
// 部署說明：
// 1. 在 GAS 編輯器中建立新的 Apps Script 專案
// 2. 複製以下所有程式碼並貼入
// 3. 點選 "部署" → "新增部署" → "網頁應用程式"
// 4. 設定執行身份為你的帳戶，執行者為 "Everyone"
// 5. 複製部署 URL 並貼入本應用的設定中

function doGet(e) {
  try {
    const action = e.parameter?.action;
    
    if (!action) {
      return ContentService.createTextOutput(JSON.stringify({ error: '缺少 action 參數' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    let result;
    
    switch(action) {
      case 'test':
        result = { success: true, message: 'GAS 連線成功' };
        break;
        
      case 'getStocks':
        result = { stocks: getStocksData() };
        break;
        
      case 'getLedger':
        result = { ledger: getLedgerData() };
        break;
        
      default:
        result = { error: 'Unknown action: ' + action };
    }
    
    const output = ContentService.createTextOutput(JSON.stringify(result));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
    
  } catch (err) {
    const output = ContentService.createTextOutput(JSON.stringify({ error: err.message }));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }
}

function doPost(e) {
  try {
    const action = e.parameter?.action;
    
    if (!action) {
      return ContentService.createTextOutput(JSON.stringify({ error: '缺少 action 參數' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    let result;
    
    switch(action) {
      case 'saveLedger':
        const ledgerData = JSON.parse(e.postData.contents).ledger;
        saveLedgerData(ledgerData);
        result = { success: true, message: '帳本已保存' };
        break;
        
      case 'savePrices':
        const prices = JSON.parse(e.postData.contents);
        savePricesData(prices.date, prices.prices);
        result = { success: true, message: '價格已保存' };
        break;
        
      default:
        result = { error: 'Unknown action: ' + action };
    }
    
    const output = ContentService.createTextOutput(JSON.stringify(result));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
    
  } catch (err) {
    const output = ContentService.createTextOutput(JSON.stringify({ error: err.message }));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }
}

function getStocksData() {
  try {
    const sheet = getOrCreateSheet('Stocks');
    if (!sheet) return [];
    
    const range = sheet.getDataRange();
    const values = range.getValues();
    if (values.length <= 1) return [];
    
    const stocks = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row[0]) continue;
      
      const stock = {
        '代號': row[0]?.toString().trim() || '',
        '名稱': row[1]?.toString().trim() || '',
        '貝氏評分': parseFloat(row[2]) || 0,
        '分類': row[3]?.toString().trim() || '',
        '現價': parseFloat(row[4]) || 0,
        '漲幅': row[5]?.toString().trim() || '0'
      };
      
      if (stock['代號'] && stock['名稱']) {
        stocks.push(stock);
      }
    }
    return stocks;
  } catch (err) {
    Logger.log('getStocksData 錯誤: ' + err);
    return [];
  }
}

function getLedgerData() {
  try {
    const sheet = getOrCreateSheet('Ledger');
    if (!sheet) return {};
    
    const range = sheet.getDataRange();
    const values = range.getValues();
    if (values.length <= 1) return {};
    
    const ledger = {};
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row[0]) continue;
      
      const date = row[0] instanceof Date 
        ? row[0].toISOString().split('T')[0]
        : row[0]?.toString().trim();
        
      if (!ledger[date]) ledger[date] = [];
      
      const entry = {
        date: date,
        code: row[1]?.toString().trim() || '',
        name: row[2]?.toString().trim() || '',
        cat: row[3]?.toString().trim() || '',
        buyPrice: parseFloat(row[4]) || 0,
        shares: parseInt(row[5]) || 0,
        score: parseFloat(row[6]) || 0
      };
      
      if (entry.code && entry.name) {
        ledger[date].push(entry);
      }
    }
    return ledger;
  } catch (err) {
    Logger.log('getLedgerData 錯誤: ' + err);
    return {};
  }
}

function saveLedgerData(ledger) {
  try {
    const sheet = getOrCreateSheet('Ledger');
    if (!sheet) return;
    
    const range = sheet.getDataRange();
    if (range.getLastRow() > 1) {
      sheet.deleteRows(2, range.getLastRow() - 1);
    }
    
    const rows = [];
    Object.entries(ledger).forEach(([date, entries]) => {
      entries.forEach(e => {
        rows.push([new Date(date), e.code, e.name, e.cat, e.buyPrice, e.shares, e.score]);
      });
    });
    
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 7).setValues(rows);
    }
  } catch (err) {
    Logger.log('saveLedgerData 錯誤: ' + err);
  }
}

function savePricesData(dateStr, prices) {
  try {
    const sheet = getOrCreateSheet('Prices');
    if (!sheet) return;
    
    const priceRows = Object.entries(prices).map(([code, price]) => [new Date(dateStr), code, price]);
    if (priceRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, priceRows.length, 3).setValues(priceRows);
    }
  } catch (err) {
    Logger.log('savePricesData 錯誤: ' + err);
  }
}

function getOrCreateSheet(sheetName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      if (sheetName === 'Stocks') {
        sheet.appendRow(['代號', '名稱', '貝氏評分', '分類', '現價', '漲幅']);
      } else if (sheetName === 'Ledger') {
        sheet.appendRow(['日期', '代號', '名稱', '分類', '買入價', '股數', '評分']);
      } else if (sheetName === 'Prices') {
        sheet.appendRow(['日期', '代號', '價格']);
      }
    }
    return sheet;
  } catch (err) {
    Logger.log('getOrCreateSheet 錯誤: ' + err);
    return null;
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
  showToast('✓ 已複製到剪貼板', 'ok');
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
  showToast('✓ 已清除快取', 'ok');
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
