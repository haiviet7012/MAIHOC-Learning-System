(() => {
  const STYLE_ID = "maihoc-billing-style";
  const money = value => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(value || 0)) + "đ";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[char]));
  let active = false, poll = null, orderCode = null, selectedMode = "student", options = { schools: [] }, plan = null, billingEnabled = false, students = [], currentOrder = null;

  const css = `
    #view .maihoc-billing{max-width:1100px;margin:0 auto;padding:clamp(18px,3vw,32px);display:grid;gap:22px;color:var(--text)}
    .maihoc-billing-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap}
    .maihoc-billing-head h1{margin:4px 0 8px;font-size:clamp(27px,4vw,38px);letter-spacing:-.04em}
    .maihoc-billing-head p{margin:0;color:var(--muted);max-width:720px}
    .maihoc-billing-card{border:1px solid var(--border);border-radius:20px;background:var(--surface);padding:clamp(18px,3vw,26px);box-shadow:var(--shadow);min-width:0}
    .maihoc-billing-plan{display:grid;grid-template-columns:minmax(0,1fr) minmax(230px,.72fr);gap:22px}
    .maihoc-billing-price{font-size:clamp(32px,4vw,43px);font-weight:800;letter-spacing:-.04em;margin:8px 0}
    .maihoc-billing-kicker{font-size:11px;letter-spacing:.12em;font-weight:800;color:var(--primary)}
    .maihoc-billing-features{list-style:none;padding:0;margin:14px 0 0;display:grid;gap:9px}
    .maihoc-billing-features li:before{content:"✓";display:inline-grid;place-items:center;width:20px;height:20px;margin-right:8px;background:var(--surface-2);color:var(--primary);border-radius:50%;font-weight:800}
    .maihoc-billing-choice{display:grid;gap:14px}
    .maihoc-billing-field{display:grid;gap:7px}
    .maihoc-billing-field label,.maihoc-billing-label{font-size:13px;font-weight:700}
    .maihoc-billing-field select,.maihoc-billing-field input[type=search]{width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--border);border-radius:11px;background:var(--surface);color:var(--text)}
    .maihoc-billing-radio{display:flex;gap:9px;flex-wrap:wrap}
    .maihoc-billing-radio label{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;cursor:pointer;font-weight:600;font-size:13px}
    .maihoc-billing-students{max-height:245px;overflow:auto;border:1px solid var(--border);border-radius:12px;padding:8px;display:grid;gap:5px}
    .maihoc-billing-student{display:flex;align-items:center;gap:9px;padding:8px;border-radius:8px;min-width:0}
    .maihoc-billing-student:hover{background:var(--surface-2)}
    .maihoc-billing-student span{min-width:0;overflow-wrap:anywhere}
    .maihoc-billing-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .maihoc-billing-muted{color:var(--muted);font-size:13px}
    .maihoc-billing-message{padding:11px 13px;border:1px solid var(--border);border-radius:11px;background:var(--surface-2);font-size:13px}
    .maihoc-checkout{display:grid;gap:18px}
    .maihoc-checkout-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
    .maihoc-checkout-top h2{margin:0}
    .maihoc-billing-badge{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;background:var(--surface-2);font-weight:800;font-size:13px}
    .maihoc-billing-badge.pending{color:#b45309;background:#fff4dd}
    .maihoc-billing-badge.paid{color:#15803d;background:#e9f8ef}
    html.dark .maihoc-billing-badge.pending{color:#fbbf24;background:#3b2d15}
    html.dark .maihoc-billing-badge.paid{color:#86efac;background:#173523}
    .maihoc-checkout-amount{font-size:clamp(32px,5vw,46px);font-weight:850;letter-spacing:-.04em;margin:5px 0}
    .maihoc-checkout-layout{display:grid;grid-template-columns:minmax(220px,290px) minmax(0,1fr);gap:28px;align-items:center}
    .maihoc-qr-wrap{display:grid;place-items:center;padding:13px;background:white;border:1px solid var(--border);border-radius:18px}
    .maihoc-qr-wrap img{width:100%;max-width:260px;aspect-ratio:1;object-fit:contain}
    .maihoc-checkout-details{display:grid;gap:15px;min-width:0}
    .maihoc-billing-copy{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-radius:11px;background:var(--surface-2);min-width:0}
    .maihoc-billing-copy code{font-size:14px;font-weight:750;overflow-wrap:anywhere}
    .maihoc-billing-copy button{min-height:36px;padding:6px 10px;flex:0 0 auto}
    .maihoc-billing-history{display:grid;gap:9px}
    .maihoc-billing-history-row{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)}
    .maihoc-billing-history-row:last-child{border-bottom:0}
    .maihoc-billing-history-row strong{display:block;overflow-wrap:anywhere}
    .maihoc-billing-empty{padding:18px;text-align:center;color:var(--muted);background:var(--surface-2);border-radius:12px}
    .maihoc-billing-table-status{font-size:12px;color:var(--muted)}
    @media(max-width:720px){.maihoc-billing-plan,.maihoc-checkout-layout{grid-template-columns:1fr}.maihoc-qr-wrap{max-width:290px;margin:0 auto}.maihoc-billing-history-row{align-items:flex-start;flex-direction:column}}
  `;
  function installCss() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.append(style);
  }
  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options,
      headers: { ...(options.body ? { "Content-Type":"application/json" } : {}), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status;
      let message = data.error || "Không thể xử lý yêu cầu Billing.";
      if (status === 404) message = "Backend hiện tại chưa cung cấp API Billing (HTTP 404). Hãy triển khai phiên bản server có /api/billing/plans trên Render.";
      else if (status >= 500) message = `Backend Billing trả về lỗi HTTP ${status}. Mở Render Logs và tìm dòng [Billing] để xem nguyên nhân.`;
      else if (status === 401) message = "Phiên đăng nhập không còn hợp lệ (HTTP 401). Vui lòng đăng nhập lại.";
      const error = new Error(message);
      error.status = status;
      throw error;
    }
    return data;
  }
  function currentUser() { return window.maihocCurrentUser || null; }
  function view() { return document.getElementById("view"); }
  function clearPolling() { if (poll) clearInterval(poll); poll = null; }
  function isBillingView() {
    const url = new URL(location.href);
    return url.pathname.replace(/\/+$/, "") === "/school/plans" && url.searchParams.get("billing") === "1";
  }
  function enhanceSchoolIntro() {
    const footer = view()?.querySelector(".school-standard-offer-foot");
    if (!footer) return;
    const note = footer.querySelector(".school-standard-price-note");
    if (note) note.innerHTML = "<strong>Đăng ký School Standard</strong><span>Giá, thời hạn và phương thức thanh toán sẽ được hiển thị trước khi tạo đơn.</span>";
    const button = footer.querySelector("button");
    if (button) {
      button.disabled = false;
      button.removeAttribute("disabled");
      button.textContent = "Đăng ký";
      button.dataset.registerSchoolStandard = "1";
    }
  }
  function statusLabel(status) {
    return ({ pending:"Chờ thanh toán", paid:"Đã thanh toán", expired:"Đã hết hạn", cancelled:"Đã hủy" })[status] || status || "Không xác định";
  }
  function badge(status) {
    return '<span class="maihoc-billing-badge ' + (status === "paid" ? "paid" : status === "pending" ? "pending" : "") + '">' + esc(statusLabel(status)) + "</span>";
  }
  function baseMarkup() {
    const user = currentUser();
    if (!user) return '<section class="maihoc-billing"><header class="maihoc-billing-head"><div><span class="maihoc-billing-kicker">MAIHOC SCHOOL · BILLING</span><h1>School Standard</h1><p>Đăng nhập để mua gói và quản lý thanh toán.</p></div></header><div class="maihoc-billing-card"><button class="button primary" type="button" data-billing-login>Đăng nhập để tiếp tục</button></div></section>';
    return '<section class="maihoc-billing" aria-label="Thanh toán MAIHOC School">' +
      '<header class="maihoc-billing-head"><div><span class="maihoc-billing-kicker">MAIHOC SCHOOL · BILLING</span><h1>Gói & thanh toán</h1><p>Mua School Standard cho tài khoản của bạn hoặc để nhà trường mua và cấp quyền cho học sinh. Quyền được kích hoạt sau khi SePay xác nhận giao dịch.</p></div><div>' + (user.isTeacher ? '<span class="maihoc-billing-badge">Giáo viên · Miễn phí</span>' : "") + '</div></header>' +
      '<div data-billing-current></div><div data-billing-main class="maihoc-billing-card"><p class="maihoc-billing-muted">Đang tải thông tin gói…</p></div>' +
      '<section class="maihoc-billing-card"><div class="maihoc-checkout-top"><h2>Lịch sử thanh toán</h2><button type="button" class="button secondary small" data-billing-refresh>↻ Làm mới</button></div><div data-billing-history class="maihoc-billing-history"><p class="maihoc-billing-muted">Đang tải lịch sử…</p></div></section>' +
      '<div class="maihoc-billing-muted">Chuyển khoản được xác nhận tự động qua SePay. MAIHOC không yêu cầu hoặc lưu thông tin đăng nhập ngân hàng của bạn.</div></section>';
  }
  async function loadAll() {
    const root = view();
    if (!root || !active) return;
    root.innerHTML = baseMarkup();
    if (!currentUser()) return;
    try {
      const plansData = await api("/api/billing/plans");
      if (!active) return;
      plan = plansData.plans?.find(item => item.code === "standard") || null;
      billingEnabled = Boolean(plansData.enabled);
      if (!billingEnabled) {
        options = { canBuyForSelf: false, canBuyForSchool: false, schools: [] };
        renderCurrent({ subscriptions: [], schoolPlan: currentUser()?.schoolPlan || "none", schoolExpiresAt: currentUser()?.schoolExpiresAt || null });
        renderPurchase();
        renderHistory([]);
        return;
      }
      const [optionsData, subscriptionData, historyData] = await Promise.all([
        api("/api/billing/options"), api("/api/billing/subscription"), api("/api/billing/history")
      ]);
      if (!active) return;
      options = optionsData;
      renderCurrent(subscriptionData);
      renderPurchase();
      renderHistory(historyData.orders || []);
      const code = new URLSearchParams(location.search).get("order");
      if (code) await loadOrder(code);
    } catch (error) {
      const main = root.querySelector("[data-billing-main]");
      if (main) main.innerHTML = '<div class="maihoc-billing-message" role="alert">' + esc(error.message) + '</div><div class="maihoc-billing-actions"><button type="button" class="button secondary small" data-billing-refresh>Thử lại</button><button type="button" class="button secondary small" data-billing-intro>Về giới thiệu School</button></div>';
      const historyTarget = root.querySelector("[data-billing-history]");
      if (historyTarget) historyTarget.innerHTML = '<div class="maihoc-billing-empty">Chưa tải được lịch sử thanh toán vì API Billing chưa phản hồi thành công.</div>';
    }
  }
  function renderCurrent(data) {
    const target = view()?.querySelector("[data-billing-current]");
    if (!target) return;
    const subscription = (data.subscriptions || []).find(item => item.status === "active" && new Date(item.expiresAt).getTime() > Date.now());
    if (data.schoolPlan === "standard" && !data.schoolExpiresAt) {
      target.innerHTML = '<div class="maihoc-billing-card"><span class="maihoc-billing-kicker">QUYỀN SCHOOL ĐƯỢC CẤP</span><h2 style="margin:7px 0">School Standard</h2><p class="maihoc-billing-muted">Tài khoản đã được cấp School miễn phí, không thời hạn. Bạn không cần thanh toán hoặc gia hạn.</p></div>';
    } else if (subscription) {
      target.innerHTML = '<div class="maihoc-billing-card"><span class="maihoc-billing-kicker">GÓI ĐANG SỬ DỤNG</span><h2 style="margin:7px 0">School Standard</h2><p class="maihoc-billing-muted">Hiệu lực đến ' + esc(new Date(subscription.expiresAt).toLocaleString("vi-VN", { timeZone:"Asia/Ho_Chi_Minh" })) + ' · Hệ thống sẽ gửi nhắc gia hạn trước 7 ngày.</p></div>';
    } else if (data.schoolPlan === "legacy") {
      target.innerHTML = '<div class="maihoc-billing-card"><span class="maihoc-billing-kicker">QUYỀN ĐƯỢC GIỮ TỪ TRƯỚC</span><h2 style="margin:7px 0">MAIHOC School</h2><p class="maihoc-billing-muted">Tài khoản của bạn đang có quyền School được giữ từ trước. Bạn không cần mua gói Standard.</p></div>';
    } else if (data.schoolPlan === "standard" && data.schoolExpiresAt) {
      target.innerHTML = '<div class="maihoc-billing-card"><span class="maihoc-billing-kicker">GÓI ĐANG SỬ DỤNG</span><h2 style="margin:7px 0">School Standard</h2><p class="maihoc-billing-muted">Hiệu lực đến ' + esc(new Date(data.schoolExpiresAt).toLocaleString("vi-VN", { timeZone:"Asia/Ho_Chi_Minh" })) + '.</p></div>';
    } else {
      target.innerHTML = '<div class="maihoc-billing-message">Bạn chưa có gói School Standard đang hoạt động.</div>';
    }
  }
  function renderPurchase() {
    const main = view()?.querySelector("[data-billing-main]");
    if (!main) return;
    const user = currentUser() || {};
    if (user.schoolPlan === "standard" && !user.schoolExpiresAt && !options.canBuyForSchool) {
      main.innerHTML = '<span class="maihoc-billing-kicker">SCHOOL STANDARD</span><h2>Bạn đã có gói School</h2><p class="maihoc-billing-muted">Quyền School được cấp miễn phí, không thời hạn. Bạn không cần mua thêm gói.</p>';
      return;
    }
    if (user.schoolPlan === "legacy" || ((user.isTeacher || user.isSuperAdmin || (user.schoolPlan === "standard" && !user.schoolExpiresAt)) && !options.canBuyForSchool)) {
      main.innerHTML = '<span class="maihoc-billing-kicker">SCHOOL STANDARD</span><h2>Gói School Standard</h2><p class="maihoc-billing-muted">Gói chỉ dành cho học sinh; giáo viên và quản trị viên không phải mua quyền cá nhân.</p>';
      return;
    }
    if (!plan) {
      main.innerHTML = '<span class="maihoc-billing-kicker">GÓI DUY NHẤT · MAIHOC SCHOOL</span><h2 style="font-size:28px;margin:8px 0">School Standard</h2><p class="maihoc-billing-message">Chưa thể mở thanh toán vì giá hoặc thời hạn của gói chưa được cấu hình trên backend. Hệ thống chưa tạo đơn và chưa nhận chuyển khoản.</p>';
      return;
    }
    if (!billingEnabled) {
      main.innerHTML = '<div class="maihoc-billing-plan"><div><span class="maihoc-billing-kicker">GÓI DUY NHẤT · MAIHOC SCHOOL</span><h2 style="font-size:28px;margin:8px 0">School Standard</h2><div class="maihoc-billing-price">' + money(plan.priceVnd) + '</div><p class="maihoc-billing-muted">Thời hạn ' + esc(plan.durationDays) + ' ngày cho mỗi học sinh.</p></div><div class="maihoc-billing-choice"><p class="maihoc-billing-message">Thanh toán SePay hiện chưa được bật. Hệ thống chưa nhận chuyển khoản cho đến khi hoàn tất migration và kiểm thử.</p></div></div>';
      return;
    }
    const maySelf = Boolean(options.canBuyForSelf);
    const maySchool = Boolean(options.canBuyForSchool && options.schools?.length);
    if (!maySelf && !maySchool) {
      main.innerHTML = '<span class="maihoc-billing-kicker">SCHOOL STANDARD</span><h2>Chưa có quyền mua gói</h2><p class="maihoc-billing-muted">Tài khoản hiện tại không phải học sinh tự mua hoặc quản trị viên của trường. Hãy liên hệ quản trị trường để được cấp quyền.</p>';
      return;
    }
    if ((selectedMode === "student" && !maySelf) || (selectedMode === "school" && !maySchool)) selectedMode = maySelf ? "student" : "school";
    main.innerHTML = '<div class="maihoc-billing-plan"><div><span class="maihoc-billing-kicker">GÓI DUY NHẤT · MAIHOC SCHOOL</span><h2 style="font-size:28px;margin:8px 0">School Standard</h2><div class="maihoc-billing-price">' + money(plan.priceVnd) + '</div><p class="maihoc-billing-muted">Thời hạn ' + esc(plan.durationDays) + ' ngày cho mỗi học sinh. Khi gia hạn, thời hạn được cộng nối tiếp sau ngày hết hạn hiện tại.</p><ul class="maihoc-billing-features">' + (plan.features || []).map(item => '<li>' + esc(item) + '</li>').join("") + '</ul></div><div class="maihoc-billing-choice"><div class="maihoc-billing-field"><span class="maihoc-billing-label">Hình thức mua</span><div class="maihoc-billing-radio">' +
      (maySelf ? '<label><input type="radio" name="billing-buyer-type" value="student" ' + (selectedMode === "student" ? "checked" : "") + '> Cá nhân tự mua</label>' : "") +
      (maySchool ? '<label><input type="radio" name="billing-buyer-type" value="school" ' + (selectedMode === "school" ? "checked" : "") + '> Nhà trường mua cho học sinh</label>' : "") +
      '</div></div><div data-billing-school-fields ' + (selectedMode === "school" ? "" : "hidden") + '><div class="maihoc-billing-field"><label for="billing-school">Nhà trường</label><select id="billing-school">' + (options.schools || []).map(s => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join("") + '</select></div><div class="maihoc-billing-field" style="margin-top:12px"><label>Chọn học sinh nhận quyền</label><input type="search" data-billing-student-search placeholder="Tìm theo tên, email hoặc lớp"><div data-billing-students class="maihoc-billing-students"><p class="maihoc-billing-muted">Đang tải danh sách học sinh…</p></div><p class="maihoc-billing-muted" data-billing-count>0 học sinh được chọn</p></div></div><div class="maihoc-billing-message" data-billing-total>' +
      (selectedMode === "school" ? "Chọn học sinh để tính tổng tiền." : "Tổng thanh toán: " + money(plan.priceVnd)) +
      '</div><div class="maihoc-billing-actions"><button type="button" class="button primary" data-billing-create ' + (plansEnabled() ? "" : "disabled") + '>Tạo đơn & thanh toán</button></div><p class="maihoc-billing-muted">Không tự động trích tiền. Gia hạn được thực hiện khi bạn tạo và thanh toán đơn mới.</p>'+(!billingEnabled?'<p class="maihoc-billing-message">Thanh toán hiện chưa được bật hoặc cấu hình SePay chưa đầy đủ. Vui lòng liên hệ quản trị viên.</p>':'')+'</div></div>';
    if (maySchool && selectedMode === "school") void loadStudents();
    updateTotal();
  }
  function plansEnabled() { return Boolean(billingEnabled && plan && options && currentUser()); }
  async function loadStudents() {
    const school = view()?.querySelector("#billing-school")?.value;
    const target = view()?.querySelector("[data-billing-students]");
    if (!school || !target) return;
    target.innerHTML = '<p class="maihoc-billing-muted">Đang tải danh sách học sinh…</p>';
    try {
      const data = await api("/api/billing/schools/" + encodeURIComponent(school) + "/students");
      students = data.students || [];
      if (!active || !view()?.querySelector("[data-billing-students]")) return;
      target.innerHTML = students.length ? students.map(s => '<label class="maihoc-billing-student" data-student-row data-search="' + esc((s.name + " " + s.email + " " + (s.classCode || "")).toLowerCase()) + '"><input type="checkbox" value="' + esc(s.id) + '"><span><strong>' + esc(s.name) + '</strong><br><small class="maihoc-billing-muted">' + esc(s.email) + (s.classCode ? " · " + esc(s.classCode) : "") + '</small></span></label>').join("") : '<p class="maihoc-billing-muted">Trường chưa có học sinh đang hoạt động.</p>';
      updateTotal();
    } catch (error) { target.innerHTML = '<p class="maihoc-billing-muted">' + esc(error.message) + '</p>'; }
  }
  function checkedStudents() {
    return [...(view()?.querySelectorAll("[data-billing-students] input:checked") || [])].map(input => Number(input.value));
  }
  function updateTotal() {
    const total = view()?.querySelector("[data-billing-total]");
    const count = view()?.querySelector("[data-billing-count]");
    const quantity = selectedMode === "school" ? checkedStudents().length : 1;
    if (total) total.textContent = quantity ? "Tổng thanh toán (" + quantity + " học sinh): " + money(Number(plan?.priceVnd || 0) * quantity) : "Chọn ít nhất một học sinh để tiếp tục.";
    if (count) count.textContent = quantity + " học sinh được chọn";
    const button = view()?.querySelector("[data-billing-create]");
    if (button) button.disabled = !plansEnabled() || (selectedMode === "school" && quantity < 1);
  }
  function renderCheckout(order) {
    const main = view()?.querySelector("[data-billing-main]");
    if (!main || !order) return;
    currentOrder = order;
    const paid = order.status === "paid";
    const expired = order.status === "expired" || (order.status === "pending" && new Date(order.paymentDeadline).getTime() <= Date.now());
    main.innerHTML = '<div class="maihoc-checkout"><div class="maihoc-checkout-top"><div><span class="maihoc-billing-kicker">MAIHOC BILLING · ' + esc(order.orderCode) + '</span><h2>Thanh toán School Standard</h2></div>' + badge(paid ? "paid" : expired ? "expired" : order.status) + '</div><div><div class="maihoc-checkout-amount">' + money(order.amountVnd) + '</div><p class="maihoc-billing-muted">School Standard · ' + esc(order.durationDays) + ' ngày / học sinh · ' + esc(order.quantity) + ' học sinh</p></div>' +
      '<div class="maihoc-checkout-layout">' +
      (order.qrImageUrl && !paid && !expired ? '<div class="maihoc-qr-wrap"><img src="' + esc(order.qrImageUrl) + '" alt="Mã VietQR thanh toán MAIHOC" loading="eager"></div>' : '<div class="maihoc-qr-wrap"><div class="maihoc-billing-empty">' + (paid ? "Thanh toán đã được xác nhận" : "Đơn hàng đã hết hạn") + '</div></div>') +
      '<div class="maihoc-checkout-details"><div><span class="maihoc-billing-muted">Ngân hàng</span><strong style="display:block">' + esc(order.bankCode || "Ngân hàng đã cấu hình") + '</strong></div><div><span class="maihoc-billing-muted">Số tài khoản</span><div class="maihoc-billing-copy"><code>' + esc(order.accountNumber || "") + '</code><button class="button secondary small" type="button" data-copy="' + esc(order.accountNumber || "") + '">Sao chép</button></div></div><div><span class="maihoc-billing-muted">Mã đơn hàng / nội dung chuyển khoản</span><div class="maihoc-billing-copy"><code>' + esc(order.transferContent || order.orderCode) + '</code><button class="button secondary small" type="button" data-copy="' + esc(order.transferContent || order.orderCode) + '">Sao chép</button></div></div><div><span class="maihoc-billing-muted">Số tiền chuyển khoản</span><div class="maihoc-billing-copy"><strong>' + money(order.amountVnd) + '</strong><button class="button secondary small" type="button" data-copy="' + esc(order.amountVnd) + '">Sao chép</button></div></div><p class="maihoc-billing-muted">' + (paid ? "Gói đã được kích hoạt cho người nhận. Bạn có thể xem thời hạn trong quyền truy cập School." : expired ? "Đơn hàng đã hết hạn. Hãy tạo đơn mới nếu bạn vẫn muốn mua gói." : "Giữ nguyên nội dung chuyển khoản để hệ thống đối chiếu. Không chuyển tiền nhiều lần cho cùng một đơn.") + '</p></div></div><div class="maihoc-billing-actions"><button type="button" class="button secondary" data-billing-back>← Quay lại gói Standard</button>' + (!paid && !expired ? '<button type="button" class="button secondary" data-billing-check>Kiểm tra trạng thái</button>' : "") + '</div></div>';
    if (!paid && !expired) startPolling(order.orderCode);
    else clearPolling();
  }
  async function createOrder() {
    const button = view()?.querySelector("[data-billing-create]");
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      const body = selectedMode === "school" ? {
        buyerType: "school",
        schoolId: Number(view().querySelector("#billing-school").value),
        studentIds: checkedStudents(),
      } : { buyerType:"student" };
      const data = await api("/api/billing/orders", { method:"POST", body:JSON.stringify(body) });
      orderCode = data.order.orderCode;
      history.replaceState(history.state, "", "/school/plans?billing=1&order=" + encodeURIComponent(orderCode));
      renderCheckout(data.order);
      const historyData = await api("/api/billing/history");
      renderHistory(historyData.orders || []);
    } catch (error) {
      const box = view()?.querySelector("[data-billing-total]");
      if (box) box.textContent = error.message;
      button.disabled = false;
    }
  }
  async function loadOrder(code) {
    try {
      const data = await api("/api/billing/orders/" + encodeURIComponent(code));
      orderCode = data.order.orderCode;
      renderCheckout(data.order);
    } catch (error) {
      const main = view()?.querySelector("[data-billing-main]");
      if (main) main.innerHTML = '<div class="maihoc-billing-message">' + esc(error.message) + '</div>';
    }
  }
  async function refreshOrder() {
    if (!orderCode || !active) return;
    try {
      const data = await api("/api/billing/orders/" + encodeURIComponent(orderCode));
      const order = data.order;
      const oldStatus = currentOrder?.status;
      if (order.status !== oldStatus) {
        renderCheckout(order);
        if (order.status === "paid") {
          await refreshCurrentUser();
          if (order.buyerType === "student") {
            const subscription = await api("/api/billing/subscription").catch(() => null);
            if (subscription) renderCurrent(subscription);
          }
        }
        const historyData = await api("/api/billing/history");
        renderHistory(historyData.orders || []);
        if (order.status === "paid") {
          const subData = await api("/api/billing/subscription");
          renderCurrent(subData);
          // Ask once when the student's payment is confirmed. The next page load
          // will navigate directly to the School AI tutor after auth is refreshed.
          if (oldStatus !== "paid" && order.buyerType === "student" &&
              currentUser()?.schoolPlan === "standard") {
            const reloadToTutor = window.confirm(
              "MAIHOC đã nhận được thanh toán và kích hoạt School Standard thành công. Tải lại trang để vào Gia sư AI của School ngay bây giờ?"
            );
            if (reloadToTutor) {
              sessionStorage.setItem("maihoc-school-paid-go-tutor", "1");
              window.location.reload();
              return;
            }
          }
        }
      }
    } catch {}
  }
  async function refreshCurrentUser() {
    const previous = currentUser();
    if (!previous) return;
    try {
      const data = await api("/api/auth/me");
      const next = data.user;
      if (next && (next.schoolPlan !== previous.schoolPlan || next.schoolExpiresAt !== previous.schoolExpiresAt)) {
        window.dispatchEvent(new CustomEvent("maihoc-user-updated", { detail: { user: next } }));
      }
    } catch {}
  }
  function startPolling(code) {
    clearPolling();
    orderCode = code;
    poll = setInterval(() => { void refreshOrder(); }, 4000);
  }
  function renderHistory(orders) {
    const target = view()?.querySelector("[data-billing-history]");
    if (!target) return;
    if (!orders.length) { target.innerHTML = '<div class="maihoc-billing-empty">Chưa có đơn hàng nào.</div>'; return; }
    target.innerHTML = orders.map(order => '<div class="maihoc-billing-history-row"><div><strong>' + esc(order.orderCode) + '</strong><span class="maihoc-billing-table-status">' + esc(order.buyerType === "school" ? "Nhà trường mua" : "Cá nhân") + ' · ' + esc(order.quantity) + ' học sinh · ' + esc(order.durationDays) + ' ngày</span></div><div style="text-align:right"><strong>' + money(order.amountVnd) + '</strong><span class="maihoc-billing-table-status">' + esc(statusLabel(order.status)) + '</span></div><button type="button" class="button secondary small" data-open-order="' + esc(order.orderCode) + '">Chi tiết</button></div>').join("");
  }
  function backToPlans() {
    clearPolling(); currentOrder = null; orderCode = null;
    window.location.assign("/school/plans");
  }
  function onClick(event) {
    const register = event.target.closest("[data-register-school-standard]");
    if (register) {
      event.preventDefault();
      window.location.assign("/school/plans?billing=1");
      return;
    }
    if (event.target.closest("[data-billing-intro]")) {
      window.location.assign("/school/plans");
      return;
    }
    if (event.target.closest("[data-billing-login]")) {
      sessionStorage.setItem("maihoc-open-billing-after-login", "1");
      document.querySelector("#login-open")?.click();
      return;
    }
    const copy = event.target.closest("[data-copy]");
    if (copy) {
      const value = copy.dataset.copy;
      navigator.clipboard?.writeText(value).then(() => { copy.textContent = "Đã sao chép"; }).catch(() => {});
      return;
    }
    if (event.target.closest("[data-billing-create]")) void createOrder();
    if (event.target.closest("[data-billing-back]")) backToPlans();
    if (event.target.closest("[data-billing-check]")) void refreshOrder();
    if (event.target.closest("[data-billing-refresh]")) void loadAll();
    const open = event.target.closest("[data-open-order]");
    if (open) void loadOrder(open.dataset.openOrder);
  }
  function onChange(event) {
    if (event.target.name === "billing-buyer-type") {
      selectedMode = event.target.value;
      renderPurchase();
    }
    if (event.target.id === "billing-school") void loadStudents();
    if (event.target.closest("[data-billing-students]") && event.target.matches("input[type=checkbox]")) updateTotal();
  }
  function onInput(event) {
    if (event.target.matches("[data-billing-student-search]")) {
      const query = event.target.value.trim().toLowerCase();
      view()?.querySelectorAll("[data-student-row]").forEach(row => { row.hidden = !row.dataset.search.includes(query); });
    }
  }
  function routeChanged(event) {
    const route = event.detail?.route;
    if (route === "school-plans" && isBillingView()) {
      active = true;
      clearPolling();
      void loadAll();
    } else if (route === "school-plans") {
      active = false;
      clearPolling();
      enhanceSchoolIntro();
    } else {
      active = false;
      clearPolling();
    }
  }
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("input", onInput);
  window.addEventListener("maihoc-route-changed", routeChanged);
  window.addEventListener("maihoc-auth-changed", () => {
    if (sessionStorage.getItem("maihoc-open-billing-after-login") === "1" && currentUser()) {
      sessionStorage.removeItem("maihoc-open-billing-after-login");
      window.location.assign("/school/plans?billing=1");
    }
  });
  window.addEventListener("focus", () => { void refreshCurrentUser(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void refreshCurrentUser(); });
  installCss();
  window.setInterval(() => { void refreshCurrentUser(); }, 60000);
  if (location.pathname.replace(/\/+$/, "") === "/school/plans") {
    if (isBillingView()) {
      active = true;
      void loadAll();
    } else {
      requestAnimationFrame(enhanceSchoolIntro);
    }
  }
})();
