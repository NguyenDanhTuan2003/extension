// background.js - Service Worker MV3
// Lắng nghe message từ content script hoặc popup

// URL trang chủ cổng sinh viên (SPA — URL không đổi khi xem chi tiết)
const PORTAL_URL = 'https://qldt.utc.edu.vn/congthongtin/Index.aspx#dashboard';
const PORTAL_ORIGIN = 'https://qldt.utc.edu.vn';

/**
 * Mở hoặc tìm lại tab cổng trường.
 * - Nếu đã có tab nào đang mở đúng origin → focus tab đó và điều hướng về PORTAL_URL.
 * - Nếu chưa có → tạo tab mới.
 * Trả về { tab, isNew } — isNew=true nếu vừa tạo mới (cần đợi load).
 */
async function getOrOpenPortalTab() {
  const tabs = await chrome.tabs.query({ url: `${PORTAL_ORIGIN}/*` });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true, url: PORTAL_URL });
    await chrome.windows.update(tab.windowId, { focused: true });
    return { tab, isNew: false };
  }
  const tab = await chrome.tabs.create({ url: PORTAL_URL });
  return { tab, isNew: true };
}

/**
 * Đợi cho đến khi tab load xong (status = 'complete').
 * Timeout sau maxMs ms để không chờ mãi.
 */
function waitForTabLoad(tabId, maxMs = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve('timeout');
    }, maxMs);

    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve('loaded');
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_NOTICES') {
    // Content script gửi trực tiếp { studentId, articles }, trong khi một số
    // client cũ gửi qua { payload: { ... } }. Hỗ trợ cả hai dạng để không
    // destructure undefined.
    handleSyncNotices(message.payload || message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // giữ kênh async mở
  }

  if (message.type === 'GET_NOTICES') {
    handleGetNotices(message.q).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_DANH_SACH_KHOA') {
    handleGetDanhSachKhoa(message.q).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_ALL_KHOA') {
    handleGetAllKhoa().then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_ALL_KHOA_DAO_TAO') {
    handleGetAllKhoaDaoTao().then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'OPEN_NOTICE_PORTAL') {
    handleOpenNoticePortal(message.notice || {}).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' }).catch(() => {});
  }
});

/**
 * Flow chính khi user click "Xem trên cổng trường":
 * 1. Mở/focus tab cổng trường về trang chủ (dashboard)
 * 2. Đợi tab load xong
 * 3. Delay thêm 1.5s để SPA (JavaScript) kịp render danh sách bài viết
 * 4. Gửi OPEN_NOTICE_DETAIL → content.js tìm element theo tiêu đề rồi click
 */
async function handleOpenNoticePortal(notice) {
  const { tab, isNew } = await getOrOpenPortalTab();

  // Nếu tạo tab mới hoặc điều hướng lại → đợi load xong
  await waitForTabLoad(tab.id);

  // Delay ngắn để content.js + inject.js kịp inject vào tab
  // MutationObserver trong inject.js tự đợi .news-group-item-title → không cần delay lớn
  const spaDelay = isNew ? 800 : 400;
  await new Promise((r) => setTimeout(r, spaDelay));

  // Yêu cầu content.js tìm và click vào bài viết
  try {
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: 'OPEN_NOTICE_DETAIL',
      notice,
    });
    if (res?.success) return { success: true };
    // Nếu content.js không tìm thấy element → trả về thông báo rõ ràng
    return { success: false, error: 'Không tìm thấy bài viết trên trang cổng trường. Hãy thử đồng bộ lại.' };
  } catch (err) {
    // content.js chưa inject (trang load chưa xong) → thông báo thân thiện
    return { success: false, error: 'Cổng trường chưa sẵn sàng. Hãy thử lại sau vài giây.' };
  }
}

const API_BASE = 'http://127.0.0.1:3000';

async function handleSyncNotices({ studentId, articles } = {}) {
  if (!studentId || !Array.isArray(articles)) {
    throw new Error('Thiếu dữ liệu đồng bộ thông báo. Hãy đăng nhập lại rồi thử lại.');
  }
  const res = await fetch(`${API_BASE}/notice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-student-id': studentId,
    },
    body: JSON.stringify({ danhSachThongBao: articles }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.message || `HTTP ${res.status}`);
  }

  return { success: true, data: await res.json() };
}

async function handleGetNotices(q = '') {
  const url = q
    ? `${API_BASE}/notice?q=${encodeURIComponent(q)}`
    : `${API_BASE}/notice`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { success: true, data: await res.json() };
}

async function handleGetDanhSachKhoa(q = '') {
  const url = q
    ? `${API_BASE}/notice/danh-sach-khoa?q=${encodeURIComponent(q)}`
    : `${API_BASE}/notice/danh-sach-khoa`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { success: true, data: await res.json() };
}

async function handleGetAllKhoa() {
  const res = await fetch(`${API_BASE}/notice/khoa`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return { success: true, data: body?.data ?? body };
}

async function handleGetAllKhoaDaoTao() {
  const res = await fetch(`${API_BASE}/notice/khoa-dao-tao`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return { success: true, data: body?.data ?? body };
}
