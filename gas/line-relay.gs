/**
 * 蟹足腫研究平台 — LINE 轉接層（Google Apps Script）
 * ------------------------------------------------------------------
 * 這支腳本是「薄轉接層」，本身不存任何病人資料，也不做業務判斷：
 *
 *   LINE ──webhook──> doPost()      ──> 平台 /api/line/message｜/api/line/event ──> Supabase
 *   每日排程 ──> sendDailyReminders() ──> 平台 /api/line/reminders（拿名單）
 *                                    ──> LINE Messaging API（推播）
 *                                    ──> 平台 /api/line/reminders（回報結果）
 *
 * 為什麼憑證放這裡而不是平台：channel access token 一旦外洩，任何人都能用官方帳號
 * 對所有好友發訊息。放在 GAS 表示平台（Vercel）即使被入侵也發不了訊息。
 *
 * ── 安裝步驟 ──────────────────────────────────────────────────────
 * 1. script.google.com 建立新專案，把這整份貼進去
 * 2. 專案設定 → 指令碼屬性，新增三個屬性：
 *      LINE_CHANNEL_ACCESS_TOKEN  （LINE Developers → Messaging API → 發行長期 token）
 *      PLATFORM_BASE_URL          （例：https://keloid-research-platform.vercel.app）
 *      LINE_RELAY_SECRET          （自己產生一組長亂數，平台的環境變數要填同一組）
 * 3. 專案設定 → 時區改成 (GMT+08:00) Taipei
 * 4. 部署 → 新增部署作業 → 類型「網頁應用程式」
 *      執行身分：我
 *      具有存取權的使用者：**所有人**（LINE 的伺服器要打得到）
 *    複製產生的網址，貼到 LINE Developers → Messaging API → Webhook URL，並「啟用 webhook」
 * 5. 觸發條件 → 新增觸發條件 → 函式 sendDailyReminders、時間驅動、每日、早上 8-9 點
 * 6. 先執行一次 testPlatformConnection() 確認平台連得上（會在執行紀錄印出結果）
 */

var PROPS = PropertiesService.getScriptProperties();
var LINE_TOKEN = PROPS.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
var BASE_URL = (PROPS.getProperty('PLATFORM_BASE_URL') || '').replace(/\/$/, '');
var RELAY_SECRET = PROPS.getProperty('LINE_RELAY_SECRET');

/** 呼叫平台 API（帶共用密鑰）。回傳解析後的 JSON，失敗時丟出錯誤。 */
function callPlatform(path, method, payload) {
  var options = {
    method: method,
    contentType: 'application/json',
    headers: { 'x-line-relay-secret': RELAY_SECRET },
    muteHttpExceptions: true,
  };
  if (payload) options.payload = JSON.stringify(payload);

  var res = UrlFetchApp.fetch(BASE_URL + path, options);
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('平台回應 ' + code + '：' + text.slice(0, 300));
  }
  return JSON.parse(text);
}

/**
 * LINE 回覆（用 webhook 事件帶的 replyToken，免費且不佔推播額度）
 * quickReply：平台回傳的 [{ label, text }]，會變成訊息下方的按鈕列，
 * 讓長輩不用打字也能瀏覽衛教。平台沒給就是一般純文字訊息。
 */
function replyToLine(replyToken, text, quickReply) {
  if (!text) return;
  var message = { type: 'text', text: String(text).slice(0, 4900) };

  if (quickReply && quickReply.length > 0) {
    message.quickReply = {
      items: quickReply.slice(0, 13).map(function (q) {
        return {
          type: 'action',
          action: { type: 'message', label: String(q.label).slice(0, 20), text: String(q.text) },
        };
      }),
    };
  }

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + LINE_TOKEN },
    muteHttpExceptions: true,
    payload: JSON.stringify({ replyToken: replyToken, messages: [message] }),
  });
}

/** LINE 主動推播（提醒用，會佔用官方帳號的訊息額度） */
function pushToLine(lineUserId, text) {
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + LINE_TOKEN },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text: String(text).slice(0, 4900) }],
    }),
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('LINE push ' + code + '：' + res.getContentText().slice(0, 200));
  }
}

/**
 * LINE webhook 進入點。
 * 注意：LINE 要求 webhook 在 10 秒內回應，而衛教問答要等 Gemini，
 * 所以先處理再回覆——GAS 沒有背景執行，實務上 Gemini 回應約 2-4 秒，仍在限制內。
 * 若之後發現逾時，改成先 return 200、再用 push 送出答案即可（平台 API 不用動）。
 */
function doPost(e) {
  var ok = ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
    ContentService.MimeType.JSON
  );
  try {
    var body = JSON.parse(e.postData.contents);
    var events = body.events || [];
    for (var i = 0; i < events.length; i++) {
      handleEvent(events[i]);
    }
  } catch (err) {
    console.error('webhook 處理失敗：' + err);
  }
  return ok; // 一律回 200，否則 LINE 會重送並可能停用 webhook
}

function handleEvent(event) {
  var lineUserId = event.source && event.source.userId;
  if (!lineUserId) return;

  if (event.type === 'message' && event.message && event.message.type === 'text') {
    var result = callPlatform('/api/line/message', 'post', {
      lineUserId: lineUserId,
      text: event.message.text,
    });
    replyToLine(event.replyToken, result.reply, result.quickReply);
    return;
  }

  if (event.type === 'follow' || event.type === 'unfollow') {
    var res = callPlatform('/api/line/event', 'post', { type: event.type, lineUserId: lineUserId });
    if (event.type === 'follow' && res.reply) replyToLine(event.replyToken, res.reply);
    return;
  }

  // 貼圖、圖片等其他事件：給一句引導並附上衛教主題按鈕（長輩常誤傳貼圖）
  if (event.type === 'message' && event.replyToken) {
    var menu = callPlatform('/api/line/message', 'post', { lineUserId: lineUserId, text: '衛教' });
    replyToLine(event.replyToken, '請以文字輸入您的問題，或直接點選下方主題：', menu.quickReply);
  }
}

/** 每日排程：拿今天該推的提醒 → 逐筆推播 → 回報結果 */
function sendDailyReminders() {
  var today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  var data = callPlatform('/api/line/reminders?date=' + today, 'get');
  var reminders = data.reminders || [];
  console.log('今天要推 ' + reminders.length + ' 則提醒');

  var results = [];
  for (var i = 0; i < reminders.length; i++) {
    var r = reminders[i];
    var item = {
      kind: r.kind,
      caseId: r.caseId,
      refId: r.refId,
      dueDate: r.dueDate,
      lineUserId: r.lineUserId,
      message: r.message,
    };
    try {
      pushToLine(r.lineUserId, r.message);
      item.status = 'sent';
    } catch (err) {
      item.status = 'failed';
      item.error = String(err).slice(0, 300);
      console.error('推播失敗（' + r.researchId + '）：' + err);
    }
    results.push(item);
    Utilities.sleep(200); // 對 LINE API 客氣一點
  }

  if (results.length > 0) {
    var ack = callPlatform('/api/line/reminders', 'post', { results: results });
    console.log('已回報 ' + ack.recorded + ' / ' + results.length + ' 筆');
  }
}

/** 安裝後先跑這支，確認三個屬性都設好、平台也連得上 */
function testPlatformConnection() {
  if (!LINE_TOKEN) console.warn('尚未設定 LINE_CHANNEL_ACCESS_TOKEN');
  if (!BASE_URL) throw new Error('尚未設定 PLATFORM_BASE_URL');
  if (!RELAY_SECRET) throw new Error('尚未設定 LINE_RELAY_SECRET');

  var today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  var data = callPlatform('/api/line/reminders?date=' + today, 'get');
  console.log('平台連線正常。今天待推提醒：' + data.count + ' 則');

  var echo = callPlatform('/api/line/message', 'post', {
    lineUserId: 'TEST_USER_DOES_NOT_EXIST',
    text: '傷口會癢怎麼辦？',
  });
  console.log('衛教問答測試回覆：' + String(echo.reply).slice(0, 120));
}
