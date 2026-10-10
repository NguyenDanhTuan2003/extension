// inject.js - Chạy trong MAIN world để truy xuất biến edu của trang web
function xoaDau(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function phanLoaiTin(item) {
  const cm = xoaDau((item.CHUYENMUC_MA || '') + ' ' + (item.CHUYENMUC_TEN || ''));
  if (cm.match(/hdsv|hoat dong sinh vien/)) return 'hoatdongsv';
  if (cm.match(/tdt|dao tao|khao thi/)) return 'daotao';
  if (cm.match(/ttnt|nha truong/)) return 'nhatruong';

  const dv = xoaDau(item.DAOTAO_COCAUTOCHUC_TEN || '');
  const tieuDe = xoaDau(item.TIEUDE || '');
  if (dv.match(/sinh vien|doan thanh nien/)) return 'hoatdongsv';
  if (dv.match(/dao tao|khao thi/) || tieuDe.match(/thoi khoa bieu|tkb|hoc phan|lich hoc/)) return 'daotao';
  return 'nhatruong';
}

function layDanhSachBaiViet() {
  return new Promise((resolve) => {
    const payload = {
      action: 'TS_TinTuc_MH/DSA4BRIVKC8VNCIeAyAvJhUoLx4PJjQuKAU0LyYP',
      func: 'pkg_tintuc.LayDSTinTuc_BangTin_NguoiDung',
      iM: edu.system.iM,
      strTuKhoa: '', strTuNgay: '', strDenNgay: '',
      strNguoiThucHien_Id: edu.system.userId,
      strChuyenMuc_Id: '', strChung_UngDung_Id: edu.system.appId,
      dTinQuanTrong: -1, strDaoTao_CoCauToChuc_Id: '',
      dHieuLuc: 1, pageIndex: 1, pageSize: 100,
    };
    edu.system.makeRequest({
      success: (res) => resolve(res && res.Success ? res.Data : []),
      error: () => resolve([]),
      type: 'POST', action: payload.action, contentType: true, data: payload, fakedb: [],
    }, false, false, false, null);
  });
}

function layChiTietBaiViet(idBaiViet) {
  return new Promise((resolve) => {
    const payload = {
      action: 'TS_TinTuc_MH/DSA4FSgvFTQiHgMgLyYVKC8eAikoFSgkNQPP',
      func: 'pkg_tintuc.LayTinTuc_BangTin_ChiTiet',
      iM: edu.system.iM,
      strChucNang_Id: '15346B6F33834D7897591527289DB0F8',
      strNguoiThucHien_Id: edu.system.userId,
      strTinTuc_BangTin_Id: idBaiViet,
    };
    edu.system.makeRequest({
      success: (res) => {
        const dataArray = Array.isArray(res.Data) ? res.Data : [res.Data];
        if (res && res.Success && dataArray.length > 0 && dataArray[0]) {
          const noiDungHtml = dataArray[0].NOIDUNG || '';
          if (!noiDungHtml) return resolve(null);
          const doc = new DOMParser().parseFromString(noiDungHtml, 'text/html');
          resolve((doc.body.textContent || '').replace(/\s+/g, ' ').trim());
        } else resolve(null);
      },
      error: () => resolve(null),
      type: 'POST', action: payload.action, contentType: true, data: payload, fakedb: [],
    }, false, false, false, null);
  });
}

// ─── MỞ BÀI VIẾT TRÊN CỔNG TRƯỜNG ───────────────────────────────────────────
window.addEventListener('EXT_OPEN_NOTICE_BY_ID', async (e) => {
  const { schoolId, tieuDe } = e.detail || {};

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // Tìm và click bài viết trong DOM hiện tại
  function findAndClickNotice() {
    // Selector chính xác cho portal UTC: div.news-group-item-title
    if (tieuDe) {
      const needle = norm(tieuDe).slice(0, 80);
      const titleEl = [...document.querySelectorAll('.news-group-item-title')].find((el) => {
        const t = norm(el.textContent);
        return t.length >= 8 && (t.includes(needle) || needle.includes(t.slice(0, 60)));
      });
      if (titleEl) {
        // Leo lên tìm phần tử click được (grandparent .news-group-item hoặc [onclick])
        const clickable = titleEl.closest('[onclick], a, button')
          || titleEl.parentElement?.parentElement
          || titleEl.parentElement
          || titleEl;
        clickable.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clickable.click();
        return true;
      }
    }

    // Fallback: tìm theo data-id nếu có schoolId
    if (schoolId) {
      const byId = document.querySelector(
        `[data-id="${CSS.escape(schoolId)}"], [data-key="${CSS.escape(schoolId)}"], a[href*="${schoolId}"]`
      );
      if (byId) {
        const clickable = byId.closest('[onclick], a, button') || byId;
        clickable.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clickable.click();
        return true;
      }
    }
    return false;
  }

  // Đợi .news-group-item-title xuất hiện (dùng MutationObserver, không dùng poll)
  function waitForNoticeList(timeoutMs = 7000) {
    return new Promise((resolve) => {
      if (document.querySelector('.news-group-item-title')) return resolve(true);
      const obs = new MutationObserver(() => {
        if (document.querySelector('.news-group-item-title')) {
          obs.disconnect();
          resolve(true);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(false); }, timeoutMs);
    });
  }

  // Step 1: Nếu chưa ở trang tintuc → click menu item sidebar để navigate
  if (typeof edu !== 'undefined' && edu.system) {
    const isTinTuc = (edu.system.urlPage || '').toLowerCase().includes('tintuc');
    if (!isTinTuc) {
      const tinTucBtn = document.querySelector('[onclick*="initMain"][onclick*="tintuc"]');
      if (tinTucBtn) tinTucBtn.click();
    }
  }

  // Step 2: Đợi danh sách bài viết render vào DOM
  await waitForNoticeList(7000);

  // Step 3: Tìm và click bài viết
  if (findAndClickNotice()) {
    window.dispatchEvent(new CustomEvent('EXT_OPEN_NOTICE_RESULT', { detail: { success: true } }));
  } else {
    window.dispatchEvent(new CustomEvent('EXT_OPEN_NOTICE_RESULT', { detail: { success: false } }));
  }
});

// ─── KIỂM TRA ĐĂNG NHẬP ───────────────────────────────────────────────────────
window.addEventListener('EXT_CHECK_LOGIN', () => {
  const isLoggedIn = typeof edu !== 'undefined' && !!edu?.system?.userId;
  window.dispatchEvent(new CustomEvent('EXT_LOGIN_RESULT', {
    detail: { isLoggedIn, userId: isLoggedIn ? edu.system.userId : null }
  }));
});

// ─── SCRAPE ──────────────────────────────────────────────────────────────────
window.addEventListener('EXT_START_SCRAPE', async () => {
  try {
    if (typeof edu === 'undefined' || !edu.system || !edu.system.makeRequest || !edu.system.userId) {
      throw new Error('Chưa đăng nhập vào cổng sinh viên!');
    }
    const studentId = edu.system.userId;
    window.dispatchEvent(new CustomEvent('EXT_SCRAPE_PROGRESS', { detail: { step: 'fetch_list', message: 'Đang kéo danh sách thông báo...' } }));

    const danhSachTho = await layDanhSachBaiViet();
    if (danhSachTho.length === 0) throw new Error('Không lấy được dữ liệu. Token có thể đã hết hạn, hãy F5 trang web.');

    const danhSachCan = danhSachTho.slice(0, 30);
    const articles = [];
    for (let i = 0; i < danhSachCan.length; i++) {
      const bai = danhSachCan[i];
      window.dispatchEvent(new CustomEvent('EXT_SCRAPE_PROGRESS', { detail: { step: 'fetch_detail', message: `Đang bóc tách (${i + 1}/${danhSachCan.length}): ${bai.TIEUDE?.substring(0, 30)}...`, current: i + 1, total: danhSachCan.length } }));
      const noiDung = await layChiTietBaiViet(bai.ID);
      articles.push({
        ID: bai.ID, TIEUDE: bai.TIEUDE, NOIDUNG: noiDung || 'Chỉ có file đính kèm',
        CHUYENMUC: phanLoaiTin(bai), NGAYTAO: bai.NGAYTAO_DD_MM_YYYY || bai.NGAYBATDAU,
      });
    }
    window.dispatchEvent(new CustomEvent('EXT_SCRAPE_PROGRESS', { detail: { step: 'sending', message: 'Đang gửi dữ liệu lên server...' } }));
    window.dispatchEvent(new CustomEvent('EXT_SCRAPE_RESULT', { detail: { success: true, data: { studentId, articles } } }));
  } catch (err) {
    window.dispatchEvent(new CustomEvent('EXT_SCRAPE_RESULT', { detail: { success: false, error: err.message } }));
  }
});
