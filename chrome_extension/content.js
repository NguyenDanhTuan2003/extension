// content.js - Chạy trong context của trang trường (ISOLATED world)
// Nhiệm vụ: quản lý Floating UI và giao tiếp với inject.js (MAIN world)

// Chèn inject.js vào trang web để lấy được biến 'edu'
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

// Thay vì scrape trực tiếp, yêu cầu inject.js làm và chờ kết quả
function scrapeAndSyncViaEvent(onProgress) {
  return new Promise((resolve, reject) => {
    const handleProgress = (e) => onProgress(e.detail);
    const handleResult = (e) => {
      window.removeEventListener('EXT_SCRAPE_PROGRESS', handleProgress);
      window.removeEventListener('EXT_SCRAPE_RESULT', handleResult);
      if (e.detail.success) resolve(e.detail.data);
      else reject(new Error(e.detail.error));
    };
    window.addEventListener('EXT_SCRAPE_PROGRESS', handleProgress);
    window.addEventListener('EXT_SCRAPE_RESULT', handleResult);
    window.dispatchEvent(new CustomEvent('EXT_START_SCRAPE'));
  });
}

// ─── FLOATING UI STATE & DOM ────────────────────────────────────────────────
let shadowRoot = null;
let panelContainer = null;
let isUIVisible = false;

const state = {
  isLoggedIn: false,
  notices: [],
  khoaList: [],
  khoaDaoTaoList: [],
  filterCM: '',
  filterKhoa: '',
  filterKhoaDaoTao: '',
  filterSearch: '',
  currentPage: 1,
  pageSize: 10,
  isSyncing: false,
};

// Lắng nghe sự kiện click icon từ background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TOGGLE_PANEL') {
    initFloatingUI();
  }

  if (msg.type === 'CHECK_LOGIN') {
    let finished = false;
    let timeoutId;

    const handleLoginResult = (event) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      window.removeEventListener('EXT_LOGIN_RESULT', handleLoginResult);
      sendResponse({
        loggedIn: event.detail?.isLoggedIn === true,
        userId: event.detail?.userId || null,
      });
    };

    window.addEventListener('EXT_LOGIN_RESULT', handleLoginResult);
    window.dispatchEvent(new CustomEvent('EXT_CHECK_LOGIN'));

    timeoutId = setTimeout(() => {
      if (finished) return;
      finished = true;
      window.removeEventListener('EXT_LOGIN_RESULT', handleLoginResult);
      sendResponse({ loggedIn: false, userId: null });
    }, 1500);

    return true;
  }

  if (msg.type === 'OPEN_NOTICE_DETAIL') {
    // openNoticeOnPortal bây giờ trả về Promise — phải return true để giữ channel async
    openNoticeOnPortal(msg.notice || {}).then((opened) => {
      sendResponse({ success: opened });
    });
    return true; // giữ channel async mở
  }
});

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function openNoticeOnPortal(notice) {
  return new Promise((resolve) => {
    // Lắng nghe kết quả từ inject.js (MAIN world)
    const handler = (e) => {
      window.removeEventListener('EXT_OPEN_NOTICE_RESULT', handler);
      resolve(e.detail?.success === true);
    };
    window.addEventListener('EXT_OPEN_NOTICE_RESULT', handler);

    // Dispatch sang inject.js với đủ thông tin để tìm bài viết
    window.dispatchEvent(new CustomEvent('EXT_OPEN_NOTICE_BY_ID', {
      detail: {
        schoolId: String(notice.schoolId || notice.ID || notice._id || notice.id || '').trim(),
        tieuDe: notice.tieuDe || notice.TIEUDE || '',
      }
    }));

    // Timeout 3s nếu inject.js không trả lời
    setTimeout(() => {
      window.removeEventListener('EXT_OPEN_NOTICE_RESULT', handler);
      resolve(false);
    }, 3000);
  });
}


// ─── INIT UI ─────────────────────────────────────────────────────────────────
async function initFloatingUI() {
  if (shadowRoot) {
    toggleUI();
    return;
  }

  panelContainer = document.createElement('div');
  panelContainer.id = 'notice-extension-root';
  panelContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 420px;
    height: 640px;
    z-index: 2147483647;
    box-shadow: 0 10px 40px rgba(0,0,0,0.6);
    border-radius: 12px;
    background: #f5f7fb;
    display: flex;
    flex-direction: column;
    resize: both;
    overflow: hidden;
    min-width: 320px;
    min-height: 400px;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 0.3s, transform 0.3s;
  `;
  document.body.appendChild(panelContainer);
  shadowRoot = panelContainer.attachShadow({ mode: 'open' });

  const cssUrl = chrome.runtime.getURL('popup/popup.css');
  const htmlUrl = chrome.runtime.getURL('popup/popup.html');

  try {
    const [cssRes, htmlRes] = await Promise.all([fetch(cssUrl), fetch(htmlUrl)]);
    const cssText = await cssRes.text();
    let htmlText = await htmlRes.text();

    const bodyMatch = htmlText.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) htmlText = bodyMatch[1];
    htmlText = htmlText.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

    const style = document.createElement('style');
    style.textContent = cssText + `
      :host { display: flex; flex-direction: column; width: 100%; height: 100%; }
      body { width: 100%; height: 100%; max-height: none; overflow: hidden; border-radius: 12px; }
      .header { cursor: grab; user-select: none; }
      .header:active { cursor: grabbing; }
      .close-btn { background: transparent; border: none; color: var(--text-2); font-size: 16px; cursor: pointer; padding: 4px 8px; margin-left: auto; transition: color 0.2s; border-radius: 4px; }
      .close-btn:hover { color: var(--red); background: rgba(255,255,255,0.1); }
      .notice-list { flex: 1; overflow-y: auto; background: #f5f7fb !important; }
      .btn-sync, .btn-sync .btn-text, .btn-sync .btn-icon {
        -webkit-text-fill-color: currentColor;
        text-shadow: none;
      }
      .btn-sync:disabled, .btn-sync:disabled .btn-text, .btn-sync:disabled .btn-icon {
        background: #3157d5 !important;
        border-color: #3157d5 !important;
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
      }
    `;

    shadowRoot.innerHTML = htmlText;
    shadowRoot.appendChild(style);

    // Khóa màu nút để browser/host page không áp native style trắng lên button.
    const syncButton = shadowRoot.querySelector('.btn-sync');
    if (syncButton) {
      syncButton.style.setProperty('background-color', '#3157d5', 'important');
      syncButton.style.setProperty('border-color', '#3157d5', 'important');
      syncButton.style.setProperty('color', '#ffffff', 'important');
      syncButton.style.setProperty('opacity', '1', 'important');
    }

    // Add Close Button
    const header = shadowRoot.querySelector('.header');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.innerHTML = '✕';
    closeBtn.title = 'Đóng bảng';
    closeBtn.onclick = (e) => { e.stopPropagation(); toggleUI(); };
    header.insertBefore(closeBtn, shadowRoot.querySelector('.btn-sync'));

    setupDraggable();
    bindUI();
    
    isUIVisible = true;
    panelContainer.style.opacity = '1';
    panelContainer.style.transform = 'translateY(0)';
    checkLogin();
    $('skeletonWrap').style.display = 'flex';
    Promise.all([loadNotices(), loadKhoaList(), loadKhoaDaoTaoList()]);
  } catch (err) {
    console.error("Lỗi load UI:", err);
    // Không để lỗi style/dữ liệu làm panel biến mất hoàn toàn.
    if (panelContainer) {
      isUIVisible = true;
      panelContainer.style.opacity = '1';
      panelContainer.style.transform = 'translateY(0)';
    }
  }
}

function toggleUI() {
  isUIVisible = !isUIVisible;
  if (isUIVisible) {
    panelContainer.style.display = 'flex';
    setTimeout(() => {
      panelContainer.style.opacity = '1';
      panelContainer.style.transform = 'translateY(0)';
    }, 10);
  } else {
    panelContainer.style.opacity = '0';
    panelContainer.style.transform = 'translateY(10px)';
    setTimeout(() => { panelContainer.style.display = 'none'; }, 300);
  }
}

function setupDraggable() {
  const header = shadowRoot.querySelector('.header');
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = panelContainer.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    panelContainer.style.right = 'auto'; // Disable right anchor
    panelContainer.style.bottom = 'auto';
    panelContainer.style.left = `${initialLeft + dx}px`;
    panelContainer.style.top = `${initialTop + dy}px`;
  });

  window.addEventListener('mouseup', () => { isDragging = false; });
}

// ─── UI LOGIC ─────────────────────────────────────────────────────────────────
const $ = (id) => shadowRoot.getElementById(id);

let toastTimer;
function showToast(msg, type = '') {
  const toast = $('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function showProgress(pct, msg) {
  $('progressWrap').style.display = 'block';
  $('progressFill').style.width = `${pct}%`;
  $('progressMsg').textContent = msg;
}
function hideProgress() {
  $('progressWrap').style.display = 'none';
  $('progressFill').style.width = '0%';
}

function buildQuery() {
  const filter = {};
  if (state.filterCM) filter.chuyenMuc = state.filterCM;
  if (state.filterKhoa) filter.khoaApDung = { $in: [Number(state.filterKhoa)] };
  if (state.filterKhoaDaoTao) filter.khoaDaoTao = { $in: [state.filterKhoaDaoTao] };
  if (state.filterSearch) filter.tieuDe = { $regex: state.filterSearch, $options: 'i' };
  // API nhận payload dạng { where, limit }, không phải filter thô.
  return JSON.stringify({
    where: filter,
    limit: 10000,
    page: 1,
  });
}

function sendBg(type, extra = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...extra }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res || !res.success) return reject(new Error(res?.error || 'Lỗi không xác định'));
      resolve(res.data);
    });
  });
}

async function loadNotices() {
  try {
    const q = buildQuery();
    const data = await sendBg('GET_NOTICES', { q });
    state.notices = Array.isArray(data) ? data : (data?.data ?? []);
    renderKhoaDaoTaoChips();
    renderNotices();
  } catch (e) {
    showToast('Lỗi: ' + e.message, 'error');
    renderEmpty('Không thể kết nối server');
  }
}

async function loadKhoaList() {
  try {
    const data = await sendBg('GET_ALL_KHOA');
    const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    state.khoaList = [...new Set(list.map(Number).filter(Number.isFinite))].sort((a, b) => b - a);
    renderKhoaChips();
  } catch (_) {}
}

async function loadKhoaDaoTaoList() {
  try {
    const data = await sendBg('GET_ALL_KHOA_DAO_TAO');
    const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    state.khoaDaoTaoList = [...new Set(list.map((value) => String(value).trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'vi'));
    renderKhoaDaoTaoChips();
  } catch (_) {}
}

function badgeClass(cm) {
  const map = { daotao: 'badge-daotao', nhatruong: 'badge-nhatruong', hoatdongsv: 'badge-hoatdongsv' };
  return map[cm] || 'badge-nhatruong';
}
function badgeLabel(cm) {
  const map = { daotao: '📚 Đào tạo', nhatruong: '🏫 Nhà trường', hoatdongsv: '🎯 Hoạt động SV' };
  return map[cm] || cm;
}
function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString('vi-VN');
}

function renderNotices() {
  $('skeletonWrap').style.display = 'none';
  const list = state.notices;
  const noticeList = $('noticeList');

  if (list.length === 0) {
    renderEmpty('Không có thông báo nào');
    $('footerCount').textContent = '0 thông báo';
    updatePagination(0);
    return;
  }

  const totalPages = Math.ceil(list.length / state.pageSize);
  state.currentPage = Math.min(state.currentPage, totalPages);
  const start = (state.currentPage - 1) * state.pageSize;
  const pageList = list.slice(start, start + state.pageSize);

  const fragment = document.createDocumentFragment();
  pageList.forEach((n) => {
    const card = document.createElement('div');
    card.className = 'notice-card';
    card.dataset.cm = n.chuyenMuc || '';

    const summaryHtml = Array.isArray(n.tomTat) && n.tomTat.length
      ? `<ul class="card-summary">${n.tomTat.map((s) => `<li>${s}</li>`).join('')}</ul>`
      : '';

    const tagsHtml = (() => {
      const tags = [];
      if (Array.isArray(n.khoaApDung) && n.khoaApDung.length)
        tags.push(...n.khoaApDung.map((k) => `K${k}`));
      if (Array.isArray(n.khoaDaoTao) && n.khoaDaoTao.length)
        tags.push(...n.khoaDaoTao.map((k) => k.replace('Khoa ', '')));
      return tags.length
        ? `<div class="card-tags">${tags.map((t) => `<span class="card-tag">${t}</span>`).join('')}</div>`
        : '';
    })();

    const details = [];
    if (Array.isArray(n.khoaApDung) && n.khoaApDung.length)
      details.push(`Khóa ${n.khoaApDung.join(', ')}`);
    if (Array.isArray(n.khoaDaoTao) && n.khoaDaoTao.length)
      details.push(...n.khoaDaoTao);
    const detailsHtml = details.length
      ? `<div class="card-details">${details.map((item) => `<span class="card-detail">${item}</span>`).join('')}</div>`
      : '';

    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${n.tieuDe || '(Không có tiêu đề)'}</span>
        <span class="card-badge ${badgeClass(n.chuyenMuc)}">${badgeLabel(n.chuyenMuc)}</span>
      </div>
      ${summaryHtml}
      ${detailsHtml}
      <div class="card-footer">
        <span class="card-date">🗓 ${formatDate(n.ngayTao)}</span>
        <div class="card-actions">${tagsHtml}<button class="card-link" type="button">Xem trên cổng trường →</button></div>
      </div>
    `;
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    const openDetail = () => {
      if (!openNoticeOnPortal(n)) showToast('Không tìm thấy thông báo này trên trang hiện tại', 'error');
    };
    card.addEventListener('click', openDetail);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') openDetail();
    });

    // Nút "Xem trên cổng trường" gọi thẳng background mở tab mới với URL ID bài viết
    const portalBtn = card.querySelector('.card-link');
    if (portalBtn) {
      portalBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Không trigger click card
        showToast('🔄 Đang mở cổng trường...', '');
        portalBtn.disabled = true;
        chrome.runtime.sendMessage(
          { type: 'OPEN_NOTICE_PORTAL', notice: n },
          (res) => {
            portalBtn.disabled = false;
            if (chrome.runtime.lastError || !res?.success) {
              const errMsg = res?.error || chrome.runtime.lastError?.message || 'Lỗi không xác định';
              showToast('❌ ' + errMsg, 'error');
            }
            // Nếu success thì tab đã mở và click xong, không cần toast thêm
          }
        );
      });
    }
    fragment.appendChild(card);
  });

  Array.from(noticeList.children).filter((el) => el.id !== 'skeletonWrap').forEach((el) => el.remove());
  noticeList.appendChild(fragment);
  $('footerCount').textContent = `${start + 1}–${Math.min(start + state.pageSize, list.length)} / ${list.length}`;
  updatePagination(list.length);
}

function updatePagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  const pageLabel = $('pageLabel');
  const prevPage = $('prevPage');
  const nextPage = $('nextPage');
  pageLabel.textContent = `${total ? state.currentPage : 1} / ${totalPages}`;
  prevPage.disabled = !total || state.currentPage <= 1;
  nextPage.disabled = !total || state.currentPage >= totalPages;
}

function renderEmpty(msg) {
  const noticeList = $('noticeList');
  Array.from(noticeList.children).filter((el) => el.id !== 'skeletonWrap').forEach((el) => el.remove());
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `<div class="empty-icon">📭</div><p class="empty-msg">${msg}</p>`;
  noticeList.appendChild(div);
}

function renderKhoaChips() {
  const khoaChips = $('khoaChips');
  const allChip = khoaChips.querySelector('[data-value=""]');
  khoaChips.innerHTML = '';
  khoaChips.appendChild(allChip);
  state.khoaList.forEach((k) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.value = String(k);
    btn.textContent = `K${k}`;
    khoaChips.appendChild(btn);
  });
  bindChips(khoaChips, 'filterKhoa');
}

function renderKhoaDaoTaoChips() {
  const values = state.khoaDaoTaoList;
  const container = $('khoaDaoTaoChips');
  const active = state.filterKhoaDaoTao;
  container.innerHTML = '<button class="chip chip-active" data-value="">Tất cả khoa</button>';
  values.forEach((value) => {
    const btn = document.createElement('button');
    btn.className = `chip${value === active ? ' chip-active' : ''}`;
    btn.dataset.value = value;
    btn.textContent = value.replace(/^Khoa\s+/i, '');
    container.appendChild(btn);
  });
  if (active) {
    const selected = container.querySelector(`[data-value="${CSS.escape(active)}"]`);
    container.querySelector('[data-value=""]').classList.toggle('chip-active', !selected);
  }
}

function bindChips(container, stateKey) {
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    container.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip-active'));
    chip.classList.add('chip-active');
    state[stateKey] = chip.dataset.value;
    state.currentPage = 1;
    loadNotices();
  });
}

function checkLogin() {
  const handleLoginResult = (e) => {
    window.removeEventListener('EXT_LOGIN_RESULT', handleLoginResult);
    const { isLoggedIn, userId } = e.detail;
    state.isLoggedIn = isLoggedIn;
    const loginStatus = $('loginStatus');
    const btnSync = $('btnSync');
    if (isLoggedIn) {
      loginStatus.textContent = `✅ ${userId}`;
      loginStatus.className = 'header-sub online';
      btnSync.disabled = false;
    } else {
      loginStatus.textContent = '⚠️ Chưa đăng nhập vào cổng SV';
      loginStatus.className = 'header-sub offline';
      btnSync.disabled = true;
    }
  };
  window.addEventListener('EXT_LOGIN_RESULT', handleLoginResult);
  window.dispatchEvent(new CustomEvent('EXT_CHECK_LOGIN'));
}

async function startSync() {
  if (state.isSyncing) return;
  state.isSyncing = true;
  const btnSync = $('btnSync');
  btnSync.classList.add('loading');
  btnSync.disabled = true;
  showProgress(5, 'Đang kéo danh sách...');

  try {
    const progressListener = (msg) => {
      const { step, message, current, total } = msg;
      if (step === 'fetch_list') showProgress(10, message);
      else if (step === 'fetch_detail') showProgress(10 + Math.round((current / total) * 75), message);
      else if (step === 'sending') showProgress(90, message);
    };

    const { studentId, articles } = await scrapeAndSyncViaEvent(progressListener);
    
    // Gửi lên server qua background
    const result = await sendBg('SYNC_NOTICES', { studentId, articles });
    
    showProgress(100, 'Hoàn thành!');
    showToast('✅ ' + (result?.message || 'Đồng bộ thành công!'), 'success');
    
    setTimeout(() => {
      hideProgress();
      loadNotices();
    }, 800);

  } catch (err) {
    hideProgress();
    showToast('❌ ' + err.message, 'error');
  } finally {
    state.isSyncing = false;
    btnSync.classList.remove('loading');
    if (state.isLoggedIn) btnSync.disabled = false;
  }
}

function bindUI() {
  bindChips($('chuyenMucChips'), 'filterCM');
  bindChips($('khoaDaoTaoChips'), 'filterKhoaDaoTao');
  $('btnSync').addEventListener('click', startSync);
  
  let searchTimer;
  $('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    state.filterSearch = e.target.value.trim();
    state.currentPage = 1;
    searchTimer = setTimeout(() => loadNotices(), 400);
  });

  $('prevPage').addEventListener('click', () => { state.currentPage -= 1; renderNotices(); });
  $('nextPage').addEventListener('click', () => { state.currentPage += 1; renderNotices(); });
}
