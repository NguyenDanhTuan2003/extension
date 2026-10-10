// popup.js — Logic chính của popup

// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  isLoggedIn: false,
  notices: [],
  khoaList: [],
  khoaDaoTaoList: [],
  filterCM: '',        // chuyên mục
  filterKhoa: '',      // khóa (số nguyên dạng string)
  filterKhoaDaoTao: '',
  filterSearch: '',    // từ khoá tìm kiếm
  currentPage: 1,
  pageSize: 10,
  isSyncing: false,
};

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const btnSync       = $('btnSync');
const loginStatus   = $('loginStatus');
const progressWrap  = $('progressWrap');
const progressFill  = $('progressFill');
const progressMsg   = $('progressMsg');
const noticeList    = $('noticeList');
const skeletonWrap  = $('skeletonWrap');
const footerCount   = $('footerCount');
const searchInput   = $('searchInput');
const chuyenMucChips = $('chuyenMucChips');
const khoaChips     = $('khoaChips');
const toast         = $('toast');
const prevPage      = $('prevPage');
const nextPage      = $('nextPage');
const pageLabel     = $('pageLabel');

// ─── TOAST ────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ─── PROGRESS ─────────────────────────────────────────────────────────────────
function showProgress(pct, msg) {
  progressWrap.style.display = 'block';
  progressFill.style.width = `${pct}%`;
  progressMsg.textContent = msg;
}
function hideProgress() {
  progressWrap.style.display = 'none';
  progressFill.style.width = '0%';
}

// ─── BUILD QUERY STRING ───────────────────────────────────────────────────────
// Server dùng mongoUniversalGet(model, q) — q là JSON filter object
function buildQuery() {
  const filter = {};

  if (state.filterCM)     filter.chuyenMuc = state.filterCM;
  if (state.filterKhoa) filter.khoaApDung = { $in: [Number(state.filterKhoa)] };
  if (state.filterKhoaDaoTao) filter.khoaDaoTao = { $in: [state.filterKhoaDaoTao] };
  if (state.filterSearch) {
    filter.tieuDe = { $regex: state.filterSearch, $options: 'i' };
  }

  // API nhận payload dạng { where, limit }, không phải filter thô.
  return JSON.stringify({
    where: filter,
    limit: 10000,
    page: 1,
  });
}

// ─── API CALLS (qua background) ───────────────────────────────────────────────
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
    // Server trả về { data: [...], total: N } hoặc trực tiếp []
    state.notices = Array.isArray(data) ? data : (data?.data ?? []);
    renderKhoaDaoTaoChips();
    renderNotices();
  } catch (e) {
    showToast('Không thể tải thông báo: ' + e.message, 'error');
    renderEmpty('Không thể kết nối server');
  }
}

async function loadKhoaList() {
  try {
    const data = await sendBg('GET_ALL_KHOA');
    const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    state.khoaList = [...new Set(list.map(Number).filter(Number.isFinite))].sort((a, b) => b - a);
    renderKhoaChips();
  } catch (_) {
    // Bỏ qua nếu không load được khoa
  }
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

// ─── RENDER ───────────────────────────────────────────────────────────────────
function badgeClass(cm) {
  const map = { daotao: 'badge-daotao', nhatruong: 'badge-nhatruong', hoatdongsv: 'badge-hoatdongsv' };
  return map[cm] || 'badge-nhatruong';
}
function badgeLabel(cm) {
  const map = { daotao: 'Đào tạo', nhatruong: 'Nhà trường', hoatdongsv: 'Hoạt động SV' };
  return map[cm] || cm;
}
function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString('vi-VN');
}

function renderNotices() {
  // Xoá skeleton
  skeletonWrap.style.display = 'none';

  // Lọc client-side bổ sung (nếu cần search)
  const list = state.notices;

  if (list.length === 0) {
    renderEmpty('Không có thông báo nào');
    footerCount.textContent = '0 thông báo';
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
        <span class="card-date">${formatDate(n.ngayTao)}</span>
        <div class="card-actions">${tagsHtml}<button class="card-link" type="button">Xem trên cổng trường →</button></div>
      </div>
    `;
    card.tabIndex = 0;
    card.setAttribute('role', 'link');

    // Nút "Xem trên cổng trường" — gửi lên background để mở/focus tab cổng trường
    const portalBtn = card.querySelector('.card-link');
    if (portalBtn) {
      portalBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showToast('🔄 Đang mở cổng trường...', '');
        portalBtn.disabled = true;
        chrome.runtime.sendMessage({ type: 'OPEN_NOTICE_PORTAL', notice: n }, (res) => {
          portalBtn.disabled = false;
          if (chrome.runtime.lastError || !res?.success) {
            const errMsg = res?.error || chrome.runtime.lastError?.message || 'Lỗi không xác định';
            showToast('❌ ' + errMsg, 'error');
          }
        });
      });
    }

    // Click vào card (không phải nút) cũng mở cổng trường
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-link')) return; // đã xử lý ở nút
      if (portalBtn) portalBtn.click();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') portalBtn?.click();
    });
    fragment.appendChild(card);
  });


  // Xoá card cũ (giữ skeleton)
  Array.from(noticeList.children)
    .filter((el) => el !== skeletonWrap)
    .forEach((el) => el.remove());

  noticeList.appendChild(fragment);
  footerCount.textContent = `${start + 1}–${Math.min(start + state.pageSize, list.length)} / ${list.length}`;
  updatePagination(list.length);
}

function updatePagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  pageLabel.textContent = `${total ? state.currentPage : 1} / ${totalPages}`;
  prevPage.disabled = !total || state.currentPage <= 1;
  nextPage.disabled = !total || state.currentPage >= totalPages;
}

function renderEmpty(msg) {
  Array.from(noticeList.children)
    .filter((el) => el !== skeletonWrap)
    .forEach((el) => el.remove());

  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `<div class="empty-icon">📭</div><p class="empty-msg">${msg}</p>`;
  noticeList.appendChild(div);
}

function renderKhoaChips() {
  // Xoá chip cũ (giữ chip "Tất cả")
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

// ─── CHIP BINDING ─────────────────────────────────────────────────────────────
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

// ─── SYNC ─────────────────────────────────────────────────────────────────────
async function startSync() {
  if (state.isSyncing) return;
  state.isSyncing = true;
  btnSync.classList.add('loading');
  btnSync.disabled = true;
  showProgress(5, 'Đang kết nối trang trường...');

  // Lắng nghe progress từ content script
  const progressListener = (msg) => {
    if (msg.type !== 'SCRAPE_PROGRESS') return;
    const { step, message, current, total } = msg.payload;
    if (step === 'fetch_list') showProgress(10, message);
    else if (step === 'fetch_detail') {
      const pct = 10 + Math.round((current / total) * 75);
      showProgress(pct, message);
    }
    else if (step === 'sending') showProgress(90, message);
  };
  chrome.runtime.onMessage.addListener(progressListener);

  try {
    // Yêu cầu content script của tab hiện tại thực hiện scrape
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Không tìm thấy tab hiện tại');

    const result = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: 'START_SCRAPE' }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res) return reject(new Error('Không nhận được phản hồi từ trang. Hãy mở trang cổng sinh viên trước.'));
        if (!res.success) return reject(new Error(res.error));
        resolve(res);
      });
    });

    showProgress(100, 'Hoàn thành!');
    showToast('✅ ' + (result.data?.message || 'Đồng bộ thành công!'), 'success');

    // Tải lại danh sách sau khi sync
    setTimeout(() => {
      hideProgress();
      loadNotices();
    }, 800);

  } catch (err) {
    hideProgress();
    showToast('❌ ' + err.message, 'error');
  } finally {
    chrome.runtime.onMessage.removeListener(progressListener);
    state.isSyncing = false;
    btnSync.classList.remove('loading');
    if (state.isLoggedIn) btnSync.disabled = false;
  }
}

// ─── LOGIN CHECK ──────────────────────────────────────────────────────────────
async function checkLogin() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return setLoginState(false);

    chrome.tabs.sendMessage(tab.id, { type: 'CHECK_LOGIN' }, (res) => {
      if (chrome.runtime.lastError || !res) return setLoginState(false);
      setLoginState(res.loggedIn, res.userId);
    });
  } catch (_) {
    setLoginState(false);
  }
}

function setLoginState(loggedIn, userId = null) {
  state.isLoggedIn = loggedIn;
  if (loggedIn) {
    loginStatus.textContent = `✅ ${userId || 'Đã đăng nhập'}`;
    loginStatus.className = 'header-sub online';
    btnSync.disabled = false;
  } else {
    loginStatus.textContent = '⚠️ Chưa đăng nhập vào cổng SV';
    loginStatus.className = 'header-sub offline';
    btnSync.disabled = true;
  }
}

// ─── SEARCH DEBOUNCE ──────────────────────────────────────────────────────────
let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  state.filterSearch = searchInput.value.trim();
  state.currentPage = 1;
  searchTimer = setTimeout(() => loadNotices(), 400);
});

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  // Bind filter chips
  bindChips(chuyenMucChips, 'filterCM');
  bindChips($('khoaDaoTaoChips'), 'filterKhoaDaoTao');
  prevPage.addEventListener('click', () => { state.currentPage -= 1; renderNotices(); });
  nextPage.addEventListener('click', () => { state.currentPage += 1; renderNotices(); });

  // Sync button
  btnSync.addEventListener('click', startSync);

  // Kiểm tra login
  await checkLogin();

  // Load dữ liệu ban đầu song song
  skeletonWrap.style.display = 'flex';
  await Promise.all([loadNotices(), loadKhoaList(), loadKhoaDaoTaoList()]);
}

init();
