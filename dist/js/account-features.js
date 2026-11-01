const $ = (s, root=document) => root.querySelector(s);
const esc = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let activeUser = null;
let activeReader = null;
let activeReaderRoot = null;
let activeReaderCleanup = null;
let readerMaxProgress = 0;
let readerSaveTimer = null;
let solutionPollTimer = null;
let activeSolutionId = null;
async function request(url, options={}) {
  const response = await fetch(url, {credentials:"same-origin", ...options});
  const contentType=response.headers.get("content-type")||"";
  const data=contentType.includes("json")?await response.json().catch(()=>({})):{};
  if (!response.ok) {
    const fallback=contentType.includes("json")
      ? `Yêu cầu thất bại (HTTP ${response.status}).`
      : `Máy chủ trả về HTTP ${response.status} thay vì JSON. Hãy khởi động lại server để nạp API lời giải AI.`;
    const error=new Error(data.error||fallback);
    error.retryAfter=Number(data.retryAfter)||Number(response.headers.get("Retry-After"))||0;
    throw error;
  }
  if(!contentType.includes("json"))throw new Error(`API trả về dữ liệu không hợp lệ (HTTP ${response.status}); hãy kiểm tra server.`);
  return data;
}
function toastNotice(message, type="success") {
  const region=$("#toast-region"); if(!region)return;
  const el=document.createElement("div");el.className="toast "+type;el.textContent=message;region.append(el);setTimeout(()=>el.remove(),3800);
}

let passwordResetEmail = "";
let verifyPurpose = "forgot_password";
let pendingNewEmail = "";
let pendingNewPassword = "";
let passwordResetCooldownUntil = 0;
let passwordResetCooldownTimer = null;
let onlineFilter = "all";
let latestOnlineUsers = [];
let currentRouteActivity = "Đang ở Trang chủ";
let examProgressTimer = null;

function routeToActivityLabel(route) {
  const map = {
    home: "Đang ở Trang chủ",
    subject: "Đang xem môn Toán",
    "subject-picker": "Đang chọn môn học",
    theory: "Đang xem Lý thuyết",
    "theory-list": "Đang xem Lý thuyết",
    practice: "Đang luyện đề ôn tập",
    "practice-list": "Đang luyện đề ôn tập",
    "exam-select": "Đang ở Phòng thi thử",
    "exam-list": "Đang chọn đề thi thử",
    reader: "Đang đọc tài liệu",
    exam: "Đang làm bài thi",
    result: "Đang xem kết quả thi",
    "saved-result": "Đang xem kết quả thi",
    admin: "Đang ở trang Quản trị",
    "study-rooms": "Đang ở Phòng tự học",
    "account-center": "Trung tâm tài khoản",
    tests: "Đang ở mục Bài kiểm tra"
  };
  return map[route] || "Đang trực tuyến";
}

function updateResendButton() {
  const button = $("#reset-resend-code");
  if (!button) return;
  const remaining = Math.max(0, Math.ceil((passwordResetCooldownUntil - Date.now()) / 1000));
  button.disabled = remaining > 0 || button.dataset.busy === "true";
  button.textContent = remaining > 0 ? `Gửi mã mới (${remaining}s)` : "Gửi mã mới";
  if (remaining > 0) {
    if (passwordResetCooldownTimer) clearTimeout(passwordResetCooldownTimer);
    passwordResetCooldownTimer = setTimeout(updateResendButton, 250);
  } else {
    passwordResetCooldownTimer = null;
  }
}

function startPasswordResetCooldown(seconds = 30) {
  passwordResetCooldownUntil = Date.now() + seconds * 1000;
  updateResendButton();
}

function resetMessage(id, message, isError = false) {
  const node = $("#" + id);
  if (!node) return;
  node.textContent = message;
  node.hidden = !message;
  node.classList.toggle("auth-error", Boolean(isError));
}

function resetEndpointBusy(form, busy) {
  const button = form?.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = busy;
    button.dataset.originalText ||= button.textContent;
    if (busy) button.textContent = "Đang xử lý...";
    else button.textContent = button.dataset.originalText;
  }
}

function showDevCodeBox(devCode) {
  const box = $("#verify-dev-code-box");
  if (!box) return;
  if (devCode) {
    box.hidden = false;
    box.innerHTML = `<span>Mã xác minh 6 chữ số của bạn:</span> <strong>${esc(devCode)}</strong>`;
  } else {
    box.hidden = true;
    box.innerHTML = "";
  }
}

function openGmailVerificationDialog({
  purpose = "forgot_password",
  email = "",
  newEmail = "",
  prefilledPassword = ""
} = {}) {
  const dialog = $("#forgot-password-dialog");
  if (!dialog) return;
  verifyPurpose = purpose;
  dialog.dataset.verifyPurpose = purpose;
  passwordResetEmail = String(email || activeUser?.email || "").trim().toLowerCase();
  pendingNewEmail = String(newEmail || "").trim().toLowerCase();
  pendingNewPassword = String(prefilledPassword || "");

  const step1Form = $("#forgot-password-form");
  const step2Form = $("#reset-password-form");
  step1Form.hidden = false;
  step2Form.hidden = true;
  resetMessage("forgot-password-error", "");
  resetMessage("forgot-password-status", "");
  resetMessage("reset-password-error", "");
  resetMessage("reset-password-status", "");
  showDevCodeBox("");

  const eyebrow1 = $("#verify-dialog-eyebrow");
  const title1 = $("#verify-dialog-title");
  const desc1 = $("#verify-dialog-desc");
  const summary1 = $("#verify-target-summary");
  const emailLabel = $("#verify-email-label");
  const emailInput = step1Form.querySelector('[name="email"]');
  const sendBtn = $("#verify-send-submit");

  const eyebrow2 = $("#verify-step2-eyebrow");
  const title2 = $("#verify-step2-title");
  const desc2 = $("#verify-step2-desc");
  const passFields = $("#verify-password-fields");
  const confirmBtn = $("#verify-confirm-submit");
  const passInput = step2Form.querySelector('[name="password"]');
  const confirmPassInput = step2Form.querySelector('[name="confirmPassword"]');
  const codeInput = step2Form.querySelector('[name="code"]');
  if (codeInput) codeInput.value = "";

  if (sendBtn) sendBtn.dataset.originalText = "Gửi mã xác minh";
  if (emailInput) {
    emailInput.value = passwordResetEmail;
    emailInput.readOnly = purpose !== "forgot_password";
  }

  if (purpose === "change_email") {
    if (eyebrow1) eyebrow1.textContent = "XÁC MINH TÀI KHOẢN GMAIL";
    if (title1) title1.textContent = "Xác nhận đổi Email";
    if (desc1) desc1.textContent = "Chúng tôi sẽ gửi mã xác minh gồm 6 chữ số (hiệu lực 10 phút) đến Gmail của bạn để xác nhận thay đổi địa chỉ Email.";
    if (emailLabel) emailLabel.textContent = "Gmail nhận mã xác minh";
    if (summary1) {
      summary1.hidden = false;
      summary1.innerHTML = `<div><strong>Email hiện tại:</strong> ${esc(passwordResetEmail)}</div><div><strong>Đổi sang Email mới:</strong> ${esc(pendingNewEmail)}</div>`;
    }
    if (eyebrow2) eyebrow2.textContent = "XÁC MINH EMAIL";
    if (title2) title2.textContent = "Nhập mã xác nhận đổi Email";
    if (desc2) desc2.textContent = `Nhập mã 6 chữ số đã gửi để xác nhận chuyển sang ${pendingNewEmail}.`;
    if (passFields) passFields.hidden = true;
    if (passInput) { passInput.required = false; passInput.value = ""; }
    if (confirmPassInput) { confirmPassInput.required = false; confirmPassInput.value = ""; }
    if (confirmBtn) { confirmBtn.textContent = "Xác nhận đổi Email"; confirmBtn.dataset.originalText = "Xác nhận đổi Email"; }
  } else if (purpose === "change_password") {
    if (eyebrow1) eyebrow1.textContent = "XÁC MINH TÀI KHOẢN GMAIL";
    if (title1) title1.textContent = "Xác nhận đổi mật khẩu";
    if (desc1) desc1.textContent = "Nhấn Gửi mã xác minh để nhận mã 6 chữ số qua Gmail đã đăng ký trước khi áp dụng mật khẩu mới.";
    if (emailLabel) emailLabel.textContent = "Gmail đã đăng ký";
    if (summary1) { summary1.hidden = true; summary1.innerHTML = ""; }
    if (eyebrow2) eyebrow2.textContent = "XÁC MINH EMAIL";
    if (title2) title2.textContent = "Xác nhận mật khẩu mới";
    if (desc2) desc2.textContent = "Nhập mã 6 chữ số từ Gmail của bạn để hoàn tất đổi mật khẩu.";
    if (passFields) passFields.hidden = false;
    if (passInput) { passInput.required = true; passInput.value = pendingNewPassword; }
    if (confirmPassInput) { confirmPassInput.required = true; confirmPassInput.value = pendingNewPassword; }
    if (confirmBtn) { confirmBtn.textContent = "Cập nhật mật khẩu"; confirmBtn.dataset.originalText = "Cập nhật mật khẩu"; }
  } else if (purpose === "delete_account") {
    if (eyebrow1) eyebrow1.textContent = "XÁC MINH BẢO MẬT GMAIL";
    if (title1) title1.textContent = "Xác nhận xóa tài khoản";
    if (desc1) desc1.textContent = "Để bảo vệ tài khoản, chúng tôi sẽ gửi mã xác minh gồm 6 chữ số đến Gmail của bạn trước khi xóa vĩnh viễn.";
    if (emailLabel) emailLabel.textContent = "Gmail xác nhận";
    if (summary1) {
      summary1.hidden = false;
      summary1.innerHTML = `<strong style="color:var(--danger)">Cảnh báo:</strong> Sau khi xác nhận mã 6 chữ số, tài khoản <strong>${esc(passwordResetEmail)}</strong> và toàn bộ tiến trình sẽ bị xóa vĩnh viễn.`;
    }
    if (eyebrow2) eyebrow2.textContent = "XÁC NHẬN CUỐI CÙNG";
    if (title2) title2.textContent = "Nhập mã xóa tài khoản";
    if (desc2) desc2.textContent = "Nhập mã 6 chữ số được gửi tới Gmail để xóa vĩnh viễn tài khoản.";
    if (passFields) passFields.hidden = true;
    if (passInput) { passInput.required = false; passInput.value = ""; }
    if (confirmPassInput) { confirmPassInput.required = false; confirmPassInput.value = ""; }
    if (confirmBtn) { confirmBtn.textContent = "Xác nhận xóa vĩnh viễn"; confirmBtn.dataset.originalText = "Xác nhận xóa vĩnh viễn"; }
  } else {
    if (eyebrow1) eyebrow1.textContent = "KHÔI PHỤC TÀI KHOẢN";
    if (title1) title1.textContent = "Quên mật khẩu";
    if (desc1) desc1.textContent = "Nhập Gmail đã đăng ký. Chúng tôi sẽ gửi mã xác minh gồm 6 chữ số, có hiệu lực trong 10 phút.";
    if (emailLabel) emailLabel.textContent = "Email đăng ký";
    if (summary1) { summary1.hidden = true; summary1.innerHTML = ""; }
    if (eyebrow2) eyebrow2.textContent = "XÁC MINH EMAIL";
    if (title2) title2.textContent = "Đặt mật khẩu mới";
    if (desc2) desc2.textContent = "Nhập mã được gửi đến Gmail và tạo mật khẩu mới.";
    if (passFields) passFields.hidden = false;
    if (passInput) { passInput.required = true; passInput.value = ""; }
    if (confirmPassInput) { confirmPassInput.required = true; confirmPassInput.value = ""; }
    if (confirmBtn) { confirmBtn.textContent = "Cập nhật mật khẩu"; confirmBtn.dataset.originalText = "Cập nhật mật khẩu"; }
  }

  if (!dialog.open) dialog.showModal();
}

async function requestPasswordResetCode() {
  const email = String(passwordResetEmail || $("#forgot-password-form [name=email]")?.value || "").trim().toLowerCase();
  if (!email) {
    resetMessage("forgot-password-error", "Vui lòng nhập Gmail đã đăng ký.", true);
    return false;
  }
  const form = $("#forgot-password-form");
  resetEndpointBusy(form, true);
  resetMessage("forgot-password-error", "");
  resetMessage("forgot-password-status", "");
  try {
    let result;
    if (verifyPurpose === "forgot_password") {
      result = await request("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
    } else {
      result = await request("/api/account/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: verifyPurpose, newEmail: pendingNewEmail })
      });
    }
    if (result.sentByEmail === false && !result.devCode) throw new Error(result.message || "Chưa gửi được email xác minh. Vui lòng thử lại.");
    passwordResetEmail = email;
    $("#forgot-password-form").hidden = true;
    $("#reset-password-form").hidden = false;
    resetMessage(
      "reset-password-status",
      result.message || "Mã xác minh gồm 6 chữ số đã được gửi đến Gmail của bạn."
    );
    showDevCodeBox(result.devCode || "");
    if (activeUser) refreshNotifications();
    startPasswordResetCooldown(30);
    $("#reset-password-form [name=code]")?.focus();
    return true;
  } catch (error) {
    const seconds = Number(error.retryAfter) || Number(String(error.message).match(/(\d+) giây/)?.[1]) || 0;
    if (seconds > 0) startPasswordResetCooldown(seconds);
    resetMessage("forgot-password-error", error.message || "Không thể gửi mã xác minh.", true);
    return false;
  } finally {
    resetEndpointBusy(form, false);
  }
}

document.addEventListener("click", async event => {
  if (event.target.closest('[data-close="forgot-password-dialog"]')) {
    const dialog = $("#forgot-password-dialog");
    if (dialog?.open) dialog.close();
    return;
  }
  if (event.target.closest("[data-open-forgot-password]")) {
    const login = $("#login-dialog"), register = $("#register-dialog");
    const clicked = event.target.closest("[data-open-forgot-password]");
    const sourceForm = clicked.closest("form");
    if (login?.open) login.close();
    if (register?.open) register.close();
    const email = sourceForm?.querySelector('[name="email"]')?.value?.trim() || "";
    openGmailVerificationDialog({ purpose: "forgot_password", email });
    return;
  }
  if (event.target.closest("#reset-resend-code")) {
    const button = event.target.closest("#reset-resend-code");
    if (Date.now() < passwordResetCooldownUntil) {
      updateResendButton();
      return;
    }
    button.dataset.busy = "true";
    updateResendButton();
    resetMessage("reset-password-error", "");
    try {
      const result = verifyPurpose === "forgot_password"
        ? await request("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: passwordResetEmail })
          })
        : await request("/api/account/send-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ purpose: verifyPurpose, newEmail: pendingNewEmail })
          });
      if (result.sentByEmail === false && !result.devCode) throw new Error(result.message || "Chưa gửi được email xác minh. Vui lòng thử lại.");
      resetMessage("reset-password-status", result.message || "Đã gửi mã xác minh 6 chữ số mới.");
      showDevCodeBox(result.devCode || "");
      if (activeUser) refreshNotifications();
      startPasswordResetCooldown(30);
    } catch (error) {
      const seconds = Number(error.retryAfter) || Number(String(error.message).match(/(\d+) giây/)?.[1]) || 0;
      if (seconds > 0) startPasswordResetCooldown(seconds);
      resetMessage("reset-password-error", error.message || "Không thể gửi mã mới.", true);
    } finally {
      button.dataset.busy = "false";
      updateResendButton();
    }
    return;
  }
  if (event.target.closest("[data-account-delete-open]")) {
    if (!activeUser || activeUser.role === "admin") return;
    openGmailVerificationDialog({
      purpose: "delete_account",
      email: activeUser.email
    });
    return;
  }
  if (event.target.closest("[data-account-progress-refresh]")) {
    await loadAccountCenterProgress();
    toastNotice("Đã cập nhật tiến trình học tập.");
    return;
  }
  if (event.target.closest("[data-ai-history-refresh]")) {
    await loadAccountAiHistory();
    toastNotice("Đã cập nhật lịch sử giải bài AI.");
    return;
  }
  if (
    event.target.closest("#online-dashboard-collapse") ||
    event.target.closest("#online-dashboard-launcher")
  ) {
    const bodyWrap = $("#app-body");
    if (bodyWrap) {
      bodyWrap.classList.toggle("online-sidebar-collapsed");
      const isCollapsed = bodyWrap.classList.contains("online-sidebar-collapsed");
      localStorage.setItem("maihoc-online-sidebar-collapsed", isCollapsed ? "1" : "0");
    }
    return;
  }
  const onlineUserRow = event.target.closest("[data-online-user-id]");
  if (onlineUserRow) {
    const userId = Number(onlineUserRow.dataset.onlineUserId);
    if (userId) {
      window.dispatchEvent(new CustomEvent("maihoc-open-direct-chat", {
        detail: { userId }
      }));
    }
    return;
  }
  const filterBtn = event.target.closest("[data-online-filter]");
  if (filterBtn) {
    onlineFilter = filterBtn.dataset.onlineFilter || "all";
    document.querySelectorAll("[data-online-filter]").forEach(btn => {
      btn.classList.toggle("is-active", btn === filterBtn);
    });
    renderOnlineUsersList();
    return;
  }
});

document.addEventListener("keydown", event => {
  const row = event.target.closest("#online-dashboard-list [data-online-user-id]");
  if (row && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    row.click();
  }
});

document.addEventListener("submit", async event => {
  const forgotForm = event.target.closest("#forgot-password-form");
  if (forgotForm) {
    event.preventDefault();
    passwordResetEmail = String(new FormData(forgotForm).get("email") || "").trim().toLowerCase();
    await requestPasswordResetCode();
    return;
  }

  const resetForm = event.target.closest("#reset-password-form");
  if (resetForm) {
    event.preventDefault();
    resetMessage("reset-password-error", "");
    resetMessage("reset-password-status", "");
    const values = new FormData(resetForm);
    const code = String(values.get("code") || "").trim();
    const password = String(values.get("password") || "");
    const confirmPassword = String(values.get("confirmPassword") || "");

    if (["forgot_password", "change_password"].includes(verifyPurpose)) {
      if (password.length < 8) {
        resetMessage("reset-password-error", "Mật khẩu mới cần ít nhất 8 ký tự.", true);
        return;
      }
      if (password !== confirmPassword) {
        resetMessage("reset-password-error", "Mật khẩu nhập lại không trùng khớp.", true);
        return;
      }
    }

    resetEndpointBusy(resetForm, true);
    try {
      if (verifyPurpose === "forgot_password") {
        const result = await request("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: passwordResetEmail, code, password })
        });
        resetMessage("reset-password-status", result.message || "Đã đổi mật khẩu. Hãy đăng nhập lại.");
        resetForm.reset();
        setTimeout(() => {
          const dialog = $("#forgot-password-dialog");
          if (dialog?.open) dialog.close();
          const login = $("#login-dialog");
          if (login && !login.open) login.showModal();
          const loginEmail = $("#login-form [name=email]");
          if (loginEmail) loginEmail.value = passwordResetEmail;
        }, 1000);
      } else if (verifyPurpose === "change_email") {
        const result = await request("/api/account/change-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newEmail: pendingNewEmail, code })
        });
        activeUser = result.user || activeUser;
        window.dispatchEvent(new CustomEvent("maihoc-user-updated", { detail: { user: activeUser } }));
        $("#account-change-email-form")?.reset();
        const dialog = $("#forgot-password-dialog");
        if (dialog?.open) dialog.close();
        toastNotice(result.message || "Đã đổi địa chỉ Gmail thành công!", "success");
        refreshNotifications();
      } else if (verifyPurpose === "change_password") {
        const result = await request("/api/account/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, password })
        });
        $("#account-change-password-form")?.reset();
        const dialog = $("#forgot-password-dialog");
        if (dialog?.open) dialog.close();
        toastNotice(result.message || "Đã đổi mật khẩu thành công!", "success");
        refreshNotifications();
      } else if (verifyPurpose === "delete_account") {
        const result = await request("/api/account/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        });
        activeUser = null;
        window.dispatchEvent(new CustomEvent("maihoc-user-updated", { detail: { user: null } }));
        const dialog = $("#forgot-password-dialog");
        if (dialog?.open) dialog.close();
        window.dispatchEvent(new CustomEvent("maihoc-navigate", { detail: { route: "home" } }));
        toastNotice(result.message || "Đã xóa tài khoản vĩnh viễn.", "success");
        refreshOnlineDashboard();
      }
    } catch (error) {
      resetMessage("reset-password-error", error.message || "Không thể xác minh mã.", true);
    } finally {
      resetEndpointBusy(resetForm, false);
    }
    return;
  }

  const changeEmailForm = event.target.closest("#account-change-email-form");
  if (changeEmailForm) {
    event.preventDefault();
    if (!activeUser || activeUser.role === "admin") return;
    const errNode = $("#account-email-error");
    if (errNode) errNode.hidden = true;
    const newEmail = String(new FormData(changeEmailForm).get("newEmail") || "").trim().toLowerCase();
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      if (errNode) { errNode.textContent = "Vui lòng nhập địa chỉ Gmail mới hợp lệ."; errNode.hidden = false; }
      return;
    }
    if (newEmail === String(activeUser?.email || "").toLowerCase()) {
      if (errNode) { errNode.textContent = "Địa chỉ Gmail mới trùng với Gmail hiện tại của bạn."; errNode.hidden = false; }
      return;
    }
    openGmailVerificationDialog({
      purpose: "change_email",
      email: activeUser?.email || "",
      newEmail
    });
    return;
  }

  const changePasswordForm = event.target.closest("#account-change-password-form");
  if (changePasswordForm) {
    event.preventDefault();
    if (!activeUser || activeUser.role === "admin") return;
    const errNode = $("#account-password-error");
    if (errNode) errNode.hidden = true;
    const fd = new FormData(changePasswordForm);
    const password = String(fd.get("password") || "");
    const confirmPassword = String(fd.get("confirmPassword") || "");
    if (password.length < 8) {
      if (errNode) { errNode.textContent = "Mật khẩu mới cần có ít nhất 8 ký tự."; errNode.hidden = false; }
      return;
    }
    if (password !== confirmPassword) {
      if (errNode) { errNode.textContent = "Mật khẩu nhập lại chưa khớp."; errNode.hidden = false; }
      return;
    }
    openGmailVerificationDialog({
      purpose: "change_password",
      email: activeUser?.email || "",
      prefilledPassword: password
    });
    return;
  }
});

function formatVietnameseDate(value) {
  if (value === null || value === undefined || value === "") return "—";
  let date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number" || /^\d{10,13}$/.test(String(value).trim())) {
    const timestamp = Number(value);
    date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
  } else {
    const raw = String(value).trim().replace(/(\.\d{3})\d+/, "$1").replace(/([+-]\d{2})$/, "$1:00");
    const normalized = raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw;
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    const utcValue = !hasTimezone && /^\d{4}-\d{2}-\d{2}/.test(normalized)
      ? (normalized.includes("T") ? normalized + "Z" : normalized + "T00:00:00Z")
      : normalized;
    date = new Date(utcValue);
  }
  if (!date || !Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function loadAccountCenterProgress() {
  const list = $("#account-progress-list");
  if (!list || !activeUser || activeUser.role === "admin") return;
  try {
    const data = await request("/api/progress");
    if (!$("#account-progress-list")) return;
    const items = Array.isArray(data.progress) ? data.progress : [];
    const totalNode = $("#account-progress-total");
    const completedNode = $("#account-progress-completed");
    const avgNode = $("#account-progress-avg");
    const completedCount = items.filter(item => Number(item.progressPercent) >= 100 || item.status === "completed").length;
    const avgPercent = items.length
      ? Math.round(items.reduce((sum, item) => sum + (Number(item.progressPercent) || 0), 0) / items.length)
      : 0;
    if (totalNode) totalNode.textContent = String(items.length);
    if (completedNode) completedNode.textContent = String(completedCount);
    if (avgNode) avgNode.textContent = `${avgPercent}%`;

    if (!items.length) {
      list.innerHTML = '<div class="account-progress-empty"><p class="muted">Bạn chưa có bài học hoặc đề thi nào trong tiến trình. Hãy mở một tài liệu lý thuyết hoặc làm đề để hệ thống ghi nhận tự động theo thời gian thực.</p></div>';
      return;
    }

    list.innerHTML = items.map((item, idx) => {
      const percent = Math.max(0, Math.min(100, Number(item.progressPercent) || 0));
      const isCompleted = percent >= 100 || item.status === "completed";
      const typeLabel =
        item.itemType === "test" ? "Bài kiểm tra" :
        item.itemType === "exam" ? "Đề thi / Ôn tập" :
        item.itemType === "practice" ? "Đề ôn tập" :
        item.itemType === "document" ? "Tài liệu lý thuyết" : "Bài học";
      const startedText = formatVietnameseDate(item.startedAt || item.updatedAt);
      const scoreText = item.gradingStatus === "pending_grade"
        ? " · Trạng thái: Đang chờ chấm"
        : item.score != null
          ? ` · Điểm: ${Number(item.score).toFixed(2)}/10`
          : "";
      const actionBtn = item.itemType === "test" && item.testSubmissionId
        ? `<button type="button" class="button secondary small" data-action="view-test-submission" data-id="${esc(item.testSubmissionId)}">Xem kết quả</button>`
        : (item.itemType === "exam" || item.itemType === "test") && item.latestAttemptId
          ? `<button type="button" class="button secondary small" data-action="view-exam-result" data-id="${esc(item.latestAttemptId)}">Xem kết quả</button>`
          : item.itemType === "document"
            ? `<button type="button" class="button secondary small" data-action="read-doc" data-id="${esc(item.itemId)}">Đọc tiếp</button>`
            : `<button type="button" class="button secondary small" data-action="start-exam" data-id="${esc(item.itemId)}">Mở đề</button>`;

      return `
        <article class="account-progress-cell ${isCompleted ? "is-completed" : "is-in-progress"}" data-progress-cell="${idx + 1}">
          <div class="account-progress-col-main">
            <div class="account-progress-title-row">
              <span class="account-progress-index">#${idx + 1}</span>
              <strong>${esc(item.itemTitle || item.itemId)}</strong>
            </div>
            <span class="muted tiny">${esc(typeLabel)} · Môn ${esc(item.subject || "Toán")} · Lớp ${esc(item.grade || "10")}${esc(scoreText)}</span>
          </div>
          <div class="account-progress-col-date">
            <span class="account-progress-date-label">Ngày bắt đầu</span>
            <strong>${esc(startedText)}</strong>
          </div>
          <div class="account-progress-col-percent">
            <div class="account-progress-percent-top">
              <strong class="${isCompleted ? "is-done" : ""}">${percent}%</strong>
              <span class="account-progress-status-chip ${isCompleted ? "is-done" : ""}">${isCompleted ? "Hoàn thành" : "Đang học"}</span>
            </div>
            <div class="account-progress-bar-track"><span style="width:${percent}%"></span></div>
          </div>
          <div class="account-progress-col-action">
            ${actionBtn}
          </div>
        </article>`;
    }).join("");
  } catch (error) {
    if ($("#account-progress-list")) {
      $("#account-progress-list").innerHTML = `<p class="auth-error">${esc(error.message || "Không tải được tiến trình học tập.")}</p>`;
    }
  }
}

async function loadAccountAiHistory() {
  const list = $("#account-ai-history-list");
  const summary = $("#account-ai-history-summary");
  if (!list || !activeUser || activeUser.role === "admin") return;
  list.setAttribute("aria-busy", "true");
  try {
    const data = await request("/api/ai/history");
    if (!$("#account-ai-history-list")) return;
    const items = Array.isArray(data.items) ? data.items : [];
    if (summary) summary.textContent = items.length
      ? `${items.length} lời giải đã lưu · mới nhất ở đầu danh sách`
      : "Chưa có lời giải AI nào được lưu cho tài khoản này.";
    if (!items.length) {
      list.innerHTML = '<div class="account-ai-history-empty"><span aria-hidden="true">✦</span><p class="muted">Khi bạn giải bài bằng AI trong lúc đăng nhập, lời giải sẽ được lưu tại đây để mở lại sau.</p></div>';
      return;
    }
    const sourceLabels = { text: "Nhập văn bản", image: "Ảnh đề bài", pdf: "Tệp PDF" };
    list.innerHTML = items.map((item, index) => {
      const mode = item.mode === "quick" || item.mode === "concise" ? "Giải nhanh" : item.mode === "hint" ? "Gợi ý phương pháp" : "Giải chi tiết";
      return `
        <article class="account-ai-history-row" data-ai-history-row="${esc(item.id)}">
          <div class="account-ai-history-main">
            <div class="account-ai-history-title-line">
              <span class="account-ai-history-index">${index + 1}</span>
              <strong title="${esc(item.title || "Bài tập AI")}">${esc(item.title || "Bài tập AI")}</strong>
            </div>
            <div class="account-ai-history-meta">
              <span>${esc(item.subject || "Môn học")}</span>
              <span>${esc(mode)}</span>
              <span>${esc(sourceLabels[item.source] || "Đề bài")}</span>
            </div>
          </div>
          <time class="account-ai-history-date">${esc(formatVietnameseDate(item.createdAt))}</time>
          <a class="button secondary small account-ai-history-open" href="#ai-solution-history-dialog" data-ai-history-open="${esc(item.id)}">Mở lời giải <span aria-hidden="true">↗</span></a>
        </article>`;
    }).join("");
  } catch (error) {
    if (list) list.innerHTML = `<p class="auth-error">${esc(error.message || "Không tải được lịch sử giải bài AI.")}</p>`;
    if (summary) summary.textContent = "Không thể đồng bộ lịch sử.";
  } finally {
    if ($("#account-ai-history-list")) list.removeAttribute("aria-busy");
  }
}

async function openSavedAiSolution(historyId) {
  const dialog = $("#ai-solution-history-dialog");
  const title = $("#ai-history-dialog-title");
  const meta = $("#ai-history-dialog-meta");
  const prompt = $("#ai-history-dialog-prompt");
  const promptSection = $("#ai-history-problem-section");
  const answer = $("#ai-history-dialog-answer");
  const status = $("#ai-history-dialog-status");
  if (!dialog || !answer) return;
  if (window.MathJax?.typesetClear) window.MathJax.typesetClear([answer]);
  if (title) title.textContent = "Đang tải lời giải…";
  if (meta) meta.textContent = "";
  if (prompt) prompt.textContent = "";
  if (promptSection) promptSection.hidden = true;
  if (answer) answer.textContent = "";
  if (status) {
    status.hidden = false;
    status.textContent = "Đang lấy lời giải đã lưu…";
    status.className = "muted ai-history-dialog-status";
  }
  if (!dialog.open) dialog.showModal();
  try {
    const data = await request("/api/ai/history/" + encodeURIComponent(historyId));
    if (title) title.textContent = data.title || "Lời giải AI";
    if (meta) meta.textContent = [
      data.subject || "Môn học",
      data.mode === "quick" || data.mode === "concise" ? "Giải nhanh" : data.mode === "hint" ? "Gợi ý phương pháp" : "Giải chi tiết",
      formatVietnameseDate(data.createdAt),
      data.modelUsed || ""
    ].filter(Boolean).join(" · ");
    if (prompt) prompt.textContent = data.promptPreview || "";
    if (promptSection) promptSection.hidden = !data.promptPreview;
    const answerText = typeof data.solution?.answer === "string"
      ? data.solution.answer
      : (data.solution ? JSON.stringify(data.solution, null, 2) : "Không có nội dung lời giải.");
    answer.innerHTML = esc(answerText).replace(/\r?\n/g, "<br>");
    if (status) status.hidden = true;
    if (window.MathJax?.typesetPromise) {
      try { await window.MathJax.typesetPromise([answer]); }
      catch (mathError) { console.warn("[AI history] MathJax rendering failed:", mathError); }
    }
  } catch (error) {
    if (status) {
      status.hidden = false;
      status.textContent = error.message || "Không thể mở lời giải đã lưu.";
      status.className = "auth-error ai-history-dialog-status";
    }
  }
}

function renderOnlineUsersList() {
  const listNode = $("#online-dashboard-list");
  const countNode = $("#online-dashboard-count");
  const launcherCount = $("#launcher-online-count");
  const totalOnline = latestOnlineUsers.length;

  if (countNode) countNode.textContent = String(totalOnline);
  if (launcherCount) launcherCount.textContent = String(totalOnline);
  if (!listNode) return;

  const filtered = latestOnlineUsers.filter(u => {
    if (onlineFilter === "admin") return u.role === "teacher" || u.role === "admin";
    if (onlineFilter === "user") return u.role !== "admin" && u.role !== "teacher";
    return true;
  });

  if (!filtered.length) {
    listNode.innerHTML = `<div class="online-empty"><p class="muted tiny">${
      totalOnline === 0
        ? "Chưa có tài khoản nào đang đăng nhập trực tuyến."
        : "Không có người dùng nào trong bộ lọc này."
    }</p></div>`;
    return;
  }

  listNode.innerHTML = filtered.map(u => {
    const isSelf = activeUser && Number(u.id) === Number(activeUser.id);
    const isSuper = u.role === "admin" && Number(u.adminLevel) >= 2;
    const isTeacher = u.role === "teacher" || (u.role === "admin" && Number(u.adminLevel) >= 1 && Number(u.adminLevel) < 2);
    const isAdmin = isSuper || isTeacher;
    const roleLabel = isSuper
      ? "Quản trị MAI HỌC"
      : isTeacher
        ? (u.homeroomClass ? `GVCN ${u.homeroomClass}` : "Giáo viên")
        : u.classCode
          ? `Học sinh (${u.classCode})`
          : "Học sinh";
    const initial = esc(String(u.name || "?").trim().slice(0, 1).toLocaleUpperCase("vi"));
    return `
      <article class="online-user-row ${isSelf ? "is-self" : ""} ${isAdmin ? "is-admin" : ""} ${isSelf ? "" : "is-clickable"}"
        ${isSelf ? "" : `data-online-user-id="${Number(u.id)}" role="button" tabindex="0" aria-label="Nhắn tin riêng với ${esc(u.name)}"`}>
        <div class="online-user-avatar">
          <span>${initial}</span>
          <i class="online-status-dot" title="Đang online"></i>
        </div>
        <div class="online-user-info">
          <div class="online-user-name-line">
            <strong>${esc(u.name)}${isSelf ? " (Bạn)" : ""}</strong>
            <span class="online-role-badge ${isAdmin ? "is-admin" : ""}">${esc(roleLabel)}</span>
          </div>
          <span class="online-user-activity">${esc(u.activity || "Đang trực tuyến")}</span>
        </div>
      </article>`;
  }).join("");
}

async function refreshOnlineDashboard() {
  try {
    const data = await request(`/api/presence/online?activity=${encodeURIComponent(currentRouteActivity)}`);
    latestOnlineUsers = Array.isArray(data.users) ? data.users : [];
    renderOnlineUsersList();
  } catch (error) {
    console.warn("Could not refresh online users:", error.message);
  }
}

async function loadUser() {
  try {
    const data = await request("/api/auth/me");
    activeUser = data.user || null;
  } catch {
    activeUser = null;
  }
  $("#user-dashboard-open")?.remove();
  const bell = $("#notifications-open"),
        upload = $("#upload-open"),
        testsBtn = $("#tests-open"),
        accountCenter = $("#account-center-open");
  if (bell) bell.hidden = !activeUser;
  if (upload) upload.hidden = !activeUser;
  if (testsBtn) testsBtn.hidden = !activeUser;
  if (accountCenter) accountCenter.hidden = !activeUser || activeUser.role === "admin";
  if (activeUser) {
    refreshNotifications();
    const reader = $("#reader-layout");
    if (reader && activeReaderRoot !== reader) startReaderTracking(reader);
    if (activeUser.role !== "admin" && $("#account-progress-list")) loadAccountCenterProgress();
    if (activeUser.role !== "admin" && $("#account-ai-history-list")) loadAccountAiHistory();
  }

}
function notificationDisplayContent(notification) {
  const title = String(notification.title || "Thông báo");
  const message = String(notification.message || "");
  const isRawGeminiFailure = /GoogleGenerativeAI Error|generativelanguage\.googleapis\.com|503 Service Unavailable/i.test(title + " " + message);
  if (!isRawGeminiFailure) return { title, message, dedupeKey: "" };

  const sourceId = message.match(/^([^:\n]{1,120}):/)?.[1]?.trim() || "";
  return {
    title: "AI tạm thời quá tải",
    message: `${sourceId ? sourceId + ": " : ""}Dịch vụ Gemini đang quá tải hoặc gián đoạn tạm thời. Vui lòng thử lại sau ít phút.`,
    dedupeKey: sourceId ? "gemini-503:" + sourceId : ""
  };
}

async function refreshNotifications() {
  if(!activeUser)return;
  try {
    const data=await request("/api/notifications");
    const badge=$("#notification-count");
    if(badge){badge.hidden=!(data.unread>0);badge.textContent=data.unread>99?"99+":String(data.unread);}
    const list=$("#notifications-list");
    if(list) {
      const seenTransientAlerts = new Set();
      const items = (data.items || []).filter(notification => {
        const display = notificationDisplayContent(notification);
        if (!display.dedupeKey) return true;
        if (seenTransientAlerts.has(display.dedupeKey)) return false;
        seenTransientAlerts.add(display.dedupeKey);
        return true;
      });
      list.innerHTML=items.length?items.map(n=>{
        const display = notificationDisplayContent(n);
        const date = formatVietnameseDate(n.createdAt);
        return '<article class="notification-item '+(n.readAt?"is-read":"is-unread")+'"><div class="notification-item-head"><strong>'+esc(display.title)+'</strong><span>'+esc(date)+'</span></div><p>'+esc(display.message)+'</p>'+(n.readAt?'':'<button class="text-button" data-notification-read="'+n.id+'">Đánh dấu đã đọc</button>')+'</article>';
      }).join(""):'<p class="muted">Bạn chưa có thông báo nào.</p>';
    }
  } catch(e) { console.warn("Notifications:",e.message); }
}
async function saveProgress(payload) {
  if(!activeUser)return null;
  try { const result=await request("/api/progress",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(result.notificationCreated)refreshNotifications();if($("#account-progress-list"))loadAccountCenterProgress();return result; }
  catch(e){console.warn("Không lưu được tiến trình:",e.message);}
}
function readerPayload(status="in_progress"){
  if(!activeReader)return null;
  return {itemType:"document",itemId:activeReader.id,itemTitle:activeReader.title,subject:activeReader.subject,grade:activeReader.grade,status,progressPercent:readerMaxProgress,lastPosition:String(readerMaxProgress)};
}
function updateReaderProgressUI(percent){
  const root=$("#reader-layout");if(!root)return;
  const value=root.querySelector("[data-reading-percent]"),bar=root.querySelector("[data-reading-bar]");
  if(value)value.textContent=`${percent}%`;
  if(bar)bar.style.width=`${percent}%`;
}
function scrollProgress(element){
  const distance=element.scrollHeight-element.clientHeight;
  if(distance<=2)return 0;
  if(element.scrollTop>=distance-2)return 100;
  return Math.floor(Math.max(0,element.scrollTop)/distance*100);
}
function measureReaderProgress(root){
  const text=root.querySelector(".document-text");
  if(text&&text.scrollHeight>text.clientHeight+2)return scrollProgress(text);
  const pdfScroller=root.querySelector(".pdf-document-scroll");
  if(pdfScroller&&pdfScroller.scrollHeight>pdfScroller.clientHeight+2)return scrollProgress(pdfScroller);
  const frame=root.querySelector(".document-viewer iframe");
  if(frame){try{const frameDoc=frame.contentDocument||frame.contentWindow.document;const scroller=frameDoc.scrollingElement||frameDoc.documentElement;if(scroller&&scroller.scrollHeight>scroller.clientHeight+2)return scrollProgress(scroller);}catch{}}
  const main=root.querySelector(".reader-main");
  if(main&&main.scrollHeight>main.clientHeight+2)return scrollProgress(main);
  const scrolling=document.scrollingElement;
  if(scrolling&&scrolling.scrollHeight>scrolling.clientHeight+2)return scrollProgress(scrolling);
  return 0;
}
function scheduleReaderProgress(root){
  if(!activeUser||!activeReader||!root.isConnected)return;
  const percent=Math.max(readerMaxProgress,Math.min(100,measureReaderProgress(root)));
  updateReaderProgressUI(percent);
  if(percent===readerMaxProgress&&percent!==0)return;
  readerMaxProgress=percent;
  clearTimeout(readerSaveTimer);
  readerSaveTimer=setTimeout(()=>saveProgress(readerPayload()),450);
}
async function startReaderTracking(root){
  if(!activeUser||!root)return;
  const id=root.dataset.readerId;
  const previousId=activeReader?.id;
  if(activeReader&&activeReaderRoot){
    readerMaxProgress=Math.max(readerMaxProgress,Math.min(100,measureReaderProgress(activeReaderRoot)));
    const pending=readerPayload();if(pending)saveProgress(pending);
  }
  if(activeReaderCleanup)activeReaderCleanup();
  activeReader={id,title:root.dataset.readerTitle||id,subject:root.dataset.readerSubject||"Toán",grade:root.dataset.readerGrade||"10"};
  activeReaderRoot=root;
  if(String(previousId)!==String(id))readerMaxProgress=0;
  clearTimeout(readerSaveTimer);
  const onScroll=()=>scheduleReaderProgress(root);
  document.addEventListener("scroll",onScroll,true);
  window.addEventListener("scroll",onScroll,{passive:true});
  const pdfScroller=root.querySelector(".pdf-document-scroll");
  pdfScroller?.addEventListener("scroll",onScroll,{passive:true});
  const iframe=root.querySelector(".document-viewer iframe");
  const onFrameLoad=()=>{try{iframe.contentWindow.addEventListener("scroll",onScroll,{passive:true});iframe.contentDocument.addEventListener("scroll",onScroll,{passive:true,capture:true});}catch{}};
  iframe?.addEventListener("load",onFrameLoad);
  if(iframe?.contentDocument?.readyState==="complete")onFrameLoad();
  const text=root.querySelector(".document-text");
  const restorePosition=()=>{
    if(!Number.isFinite(scrollPercent)||scrollPercent<=0)return;
    if(pdfScroller&&pdfScroller.scrollHeight>pdfScroller.clientHeight){pdfScroller.scrollTop=(pdfScroller.scrollHeight-pdfScroller.clientHeight)*scrollPercent/100;return;}
    if(text&&text.scrollHeight>text.clientHeight){text.scrollTop=(text.scrollHeight-text.clientHeight)*scrollPercent/100;return;}
    if(iframe){try{const scroller=iframe.contentDocument.scrollingElement||iframe.contentDocument.documentElement;scroller.scrollTop=(scroller.scrollHeight-scroller.clientHeight)*scrollPercent/100;return;}catch{}}
    const scrolling=document.scrollingElement;if(scrolling)scrolling.scrollTop=(scrolling.scrollHeight-scrolling.clientHeight)*scrollPercent/100;
  };
  let scrollPercent=0;
  activeReaderCleanup=()=>{document.removeEventListener("scroll",onScroll,true);window.removeEventListener("scroll",onScroll);pdfScroller?.removeEventListener("scroll",onScroll);iframe?.removeEventListener("load",onFrameLoad);root.removeEventListener("pdf-reader-ready",restorePosition);clearTimeout(readerSaveTimer);};
  try{
    const data=await request("/api/progress");
    if(activeReader?.id!==id||!root.isConnected)return;
    const saved=(data.progress||[]).find(p=>p.itemType==="document"&&String(p.itemId)===String(id));
    readerMaxProgress=Math.max(0,Math.min(100,Number(saved?.progressPercent)||0));
    updateReaderProgressUI(readerMaxProgress);
    scrollPercent=Number(saved?.lastPosition);
    if(Number.isFinite(scrollPercent)&&scrollPercent>0){
      if(pdfScroller&&pdfScroller.dataset.pdfReady!=="true")root.addEventListener("pdf-reader-ready",restorePosition,{once:true});
      else requestAnimationFrame(restorePosition);
    }
    if(!saved)saveProgress(readerPayload());
  }catch(error){console.warn("Could not load reading progress:",error.message);}
}
window.addEventListener("maihoc-reader-leaving",()=>{
  if(!activeReader)return;
  const root=$("#reader-layout");
  if(root)readerMaxProgress=Math.max(readerMaxProgress,Math.min(100,measureReaderProgress(root)));
  updateReaderProgressUI(readerMaxProgress);clearTimeout(readerSaveTimer);
  const payload=readerPayload(readerMaxProgress===100?"completed":"in_progress");
  if(payload)saveProgress(payload);
  activeReaderCleanup?.();activeReaderCleanup=null;activeReader=null;activeReaderRoot=null;
});
window.addEventListener("maihoc-exam-completed",event=>{
  const d=event.detail||{};
  saveProgress({itemType:"exam",itemId:String(d.id||d.title||"exam"),itemTitle:d.title||"Đề thi",subject:d.subject||"Toán",grade:d.grade||"10",status:"completed",progressPercent:100,answers:d.answers||{},lastPosition:"100"});
});
window.addEventListener("pagehide",()=>{
  if(!activeReader)return;
  if(activeReaderRoot)readerMaxProgress=Math.max(readerMaxProgress,Math.min(100,measureReaderProgress(activeReaderRoot)));
  const payload=readerPayload(readerMaxProgress===100?"completed":"in_progress");
  if(payload)fetch("/api/progress",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
  activeReaderCleanup?.();activeReaderCleanup=null;activeReader=null;activeReaderRoot=null;
});
function addAdminReviewPanel() {
  if(!activeUser||activeUser.role!=="admin"||!$("#admin-users-table")||$("#admin-review-panel"))return;
  const panel=document.createElement("section");panel.id="admin-review-panel";panel.className="admin-submissions";
  panel.innerHTML='<div class="section-head"><div><h2>Tài liệu đã duyệt</h2><p class="muted">Xóa tài liệu khỏi thư viện.</p></div><button type="button" class="button primary" data-answer-key-open>Quản lý đáp án</button></div><div id="approved-documents"><p class="muted">Loading...</p></div><div class="section-head"><div><h2>Tài liệu chờ duyệt</h2></div></div><div id="pending-submissions"><p class="muted">Loading...</p></div>';

  $("#admin-users-table").after(panel);loadApprovedDocuments();loadSubmissions();
  window.dispatchEvent(new Event("maihoc-admin-panel-mounted"));
}
function documentCategoryLabel(category) {
  return ({
    theory: "Lý thuyết",
    practice: "Đề ôn tập",
    exam: "Đề thi thử",
    exercise: "Bài tập",
    test: "Bài kiểm tra",
    answer: "Đáp án",
    lesson: "Bài học",
    document: "Tài liệu"
  })[String(category || "").trim().toLowerCase()] || "Tài liệu khác";
}
async function loadApprovedDocuments(){
  const box=$("#approved-documents");if(!box)return;
  try{
    const data=await request("/api/documents?scope=manage");
    const documents=Array.isArray(data)?data:[];
    if(!documents.length){box.innerHTML='<p class="muted">Chưa có tài liệu đã duyệt.</p>';return;}
    box.innerHTML='<div class="admin-table-wrap admin-approved-documents-scroll" role="region" aria-label="Danh sách tài liệu đã duyệt" tabindex="0"><table class="admin-table"><thead><tr><th>Tài liệu</th><th>Danh mục</th><th>Dung lượng</th><th>Thao tác</th></tr></thead><tbody>'+documents.map(d=>'<tr><td><strong>'+esc(d.title)+'</strong><br><span class="muted tiny">'+esc(d.originalName||d.filename)+'</span></td><td>'+esc(d.subject)+' / Lớp '+esc(d.grade)+' / '+esc(documentCategoryLabel(d.category))+'</td><td>'+Math.ceil((Number(d.size)||0)/1024)+' KB</td><td><button class="button secondary small" data-delete-document="'+esc(d.id)+'">Xóa</button></td></tr>').join('')+'</tbody></table></div>';
  }catch(error){box.innerHTML='<p class="auth-error">'+esc(error.message)+'</p>';}
}
async function loadAnswerKeySections(){
  const dialog=$("#answer-key-dialog");if(!dialog)return;
  for(const category of ["theory","practice","exam","test"]){const list=dialog.querySelector(`[data-answer-key-list="${category}"]`);if(list)list.innerHTML='<p class="muted">Đang tải...</p>';}
  try{
    const data=await request("/api/admin/answer-keys");
    for(const category of ["theory","practice","exam","test"]){
      const list=dialog.querySelector(`[data-answer-key-list="${category}"]`);if(!list)continue;
      const docs=data.sections?.[category]||[];
      if(!docs.length){list.innerHTML='<p class="muted">Chưa có tài liệu.</p>';continue;}
      list.innerHTML=docs.map(doc=>{
        let statusLabel="",statusClass="";
        const isManualReview=doc.solutionStatus==="review"&&(doc.solutionMode==="manual"||doc.solutionPhase==="Nhập đáp án thủ công");
        if(category==="theory"){statusLabel="Không cần đáp án";}
        else if(["queued","reading","solving"].includes(doc.solutionStatus)){statusLabel=doc.solutionPhase||"AI đang xử lý";statusClass="";}
        else if(isManualReview){statusLabel="Đang nhập thủ công (Chờ lưu)";statusClass="";}
        else if(doc.solutionStatus==="review"){statusLabel="Chờ duyệt lời giải AI";statusClass="";}
        else if(doc.solutionStatus==="ready"){statusLabel="Đã duyệt, sẵn sàng chấm";statusClass="is-ready";}
        else if(doc.solutionStatus==="failed"){statusLabel="AI chưa tạo được đáp án";statusClass="is-missing";}
        else if(doc.hasAnswerKey){statusLabel="Có tệp đáp án tham khảo";statusClass="";}
        else {statusLabel="Chưa có đáp án";statusClass="is-missing";}
        const status=`<div class="answer-key-statuses answer-key-status-row"><span class="answer-key-status ${statusClass}">${esc(statusLabel)}${["queued","reading","solving"].includes(doc.solutionStatus)?` · ${esc(doc.solutionProgress||0)}%`:""}</span></div>`;
        let solution="";
        if(category!=="theory"){
          if(doc.solutionStatus==="ready"){
            solution=`<div class="exam-solution-admin-actions"><button class="button secondary small" data-solution-open="${esc(doc.id)}">✓ Xem bộ chấm</button><button class="button secondary small" data-solution-generate="${esc(doc.id)}">🤖 AI giải lại</button><button class="button secondary small" data-solution-manual="${esc(doc.id)}">✍️ Sửa thủ công</button></div>`;
          }else if(["queued","reading","solving"].includes(doc.solutionStatus)){
            solution=`<div class="exam-solution-admin-actions"><button class="button secondary small" data-solution-open="${esc(doc.id)}">⏳ Xem tiến trình AI</button><button class="button secondary small" data-solution-manual="${esc(doc.id)}">✍️ Nhập thủ công</button></div>`;
          }else if(isManualReview){
            solution=`<div class="exam-solution-admin-actions"><button class="button secondary small" data-solution-generate="${esc(doc.id)}">🤖 Giải đề bằng AI</button><button class="button primary small" data-solution-manual="${esc(doc.id)}">✍️ Tiếp tục nhập thủ công</button></div>`;
          }else if(doc.solutionStatus==="review"){
            solution=`<div class="exam-solution-admin-actions"><button class="button primary small" data-solution-open="${esc(doc.id)}">🤖 Duyệt lời giải AI</button><button class="button secondary small" data-solution-manual="${esc(doc.id)}">✍️ Nhập đáp án thủ công</button></div>`;
          }else{
            solution=`<div class="exam-solution-admin-actions"><button class="button secondary small" data-solution-generate="${esc(doc.id)}">${doc.solutionStatus==="failed"?"🤖 Thử giải lại bằng AI":"🤖 Giải đề bằng AI"}</button><button class="button secondary small" data-solution-manual="${esc(doc.id)}">✍️ Nhập đáp án thủ công</button></div>`;
          }
        }
        return `<article class="answer-key-row"><div class="answer-key-main"><strong>${esc(doc.title)}</strong><span class="muted tiny">Lớp ${esc(doc.grade)}${doc.originalName?" · "+esc(doc.originalName):""}</span><div class="answer-key-statuses"><a class="text-button" href="/api/documents/${encodeURIComponent(doc.id)}/file" target="_blank" rel="noopener">Xem đề</a></div>${status}${solution}</div></article>`;
      }).join("");
    }
  }catch(error){
    for(const category of ["theory","practice","exam","test"]){const list=dialog.querySelector(`[data-answer-key-list="${category}"]`);if(list)list.innerHTML=`<p class="auth-error">${esc(error.message)}</p>`;}
  }
}

function solutionLabel(status){return ({queued:"Đang chờ xử lý",reading:"Đang đọc đề",solving:"AI đang giải đề",review:"Chờ giáo viên / admin duyệt",ready:"Đã duyệt, sẵn sàng chấm",failed:"Không tạo được lời giải",not_started:"Chưa tạo lời giải"})[status]||status;}
function solutionMathText(value){
  let text=String(value??"")
    .replace(/\\\\/g,"\n")
    .replace(/\\\(|\\\)|\\\[|\\\]|\$\$?/g,"")
    .replace(/\begin\{(?:aligned|align\*?|gathered|array)\}(?:\{[^}]*\})?/g,"")
    .replace(/\\end\{(?:aligned|align\*?|gathered|array)\}/g,"")
    .replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle|left|right|quad|qquad)\b/g,"")
    .replace(/\\(?:,|;|:|!)/g," ");
  const superscript={"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ"};
  const subscript={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"⁷","8":"₈","9":"₉","+":"₊","-":"₋","=":"₌","(":"₍",")":"₎","i":"ᵢ","n":"ₙ","x":"ₓ"};
  const replaceScript=(match,raw,map)=>{
    const value=raw.trim();
    if(/^[0-9+\-=()ni x]+$/.test(value)) return [...value.replace(/\s/g,"")].map(ch=>map[ch]||ch).join("");
    return match;
  };
  for(let i=0;i<8;i++){
    const previous=text;
    text=text
      .replace(/\\overrightarrow\s*\{([^{}]*)\}/g,"→$1")
      .replace(/\\vec\s*\{([^{}]*)\}/g,"$1⃗")
      .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,"($1)/($2)")
      .replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g,"($2)^(1/$1)")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g,"√($1)")
      .replace(/\\(?:text|textrm|textnormal|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g,"$1")
      .replace(/\\hat\s*\{([^{}]*)\}/g,"$1\u0302")
      .replace(/\\overline\s*\{([^{}]*)\}/g,"$1\u0305")
      .replace(/\^\{([^{}]*)\}/g,(m,v)=>replaceScript(m,v,superscript))
      .replace(/_\{([^{}]*)\}/g,(m,v)=>replaceScript(m,v,subscript))
      .replace(/\^([0-9+\-=()ni])/g,(_,v)=>superscript[v]||("^"+v))
      .replace(/_([0-9+\-=()ni])/g,(_,v)=>subscript[v]||("_"+v));
    if(text===previous)break;
  }
  return text
    .replace(/\\times\b/g,"×").replace(/\\cdot\b/g,"·").replace(/\div\b/g,"÷")
    .replace(/\\pm\b/g,"±").replace(/\\mp\b/g,"∓").replace(/\\infty\b/g,"∞")
    .replace(/\\sum\b/g,"∑").replace(/\\prod\b/g,"∏").replace(/\\int\b/g,"∫").replace(/\\oint\b/g,"∮")
    .replace(/\\pi\b/g,"π").replace(/\\alpha\b/g,"α").replace(/\beta\b/g,"β").replace(/\\gamma\b/g,"γ")
    .replace(/\\theta\b/g,"θ").replace(/\\lambda\b/g,"λ").replace(/\\mu\b/g,"μ").replace(/\\sigma\b/g,"σ").replace(/\\omega\b/g,"ω")
    .replace(/\\Delta\b/g,"Δ").replace(/\\Omega\b/g,"Ω").replace(/\\phi\b|\\varphi\b/g,"φ")
    .replace(/\\leq?\b/g,"≤").replace(/\\geq?\b/g,"≥").replace(/\neq\b/g,"≠").replace(/\\approx\b/g,"≈").replace(/\\equiv\b/g,"≡")
    .replace(/\\in\b/g,"∈").replace(/\notin\b/g,"∉").replace(/\\subseteq\b/g,"⊆").replace(/\\cup\b/g,"∪").replace(/\\cap\b/g,"∩")
    .replace(/\\Rightarrow\b|\\Longrightarrow\b/g,"⇒").replace(/\\rightarrow\b|\\to\b/g,"→").replace(/\\leftarrow\b/g,"←")
    .replace(/\\leftrightarrow\b/g,"↔").replace(/\\mapsto\b/g,"↦").replace(/\\circ\b/g,"°").replace(/\\angle\b/g,"∠").replace(/\\perp\b/g,"⊥")
    .replace(/\\log\b/g,"log").replace(/\\ln\b/g,"ln").replace(/\\(?:sin|cos|tan|cot|sec|csc)\b/g,m=>m.slice(1))
    .replace(/\\([A-Za-z]+)/g,"$1").replace(/\\([{}_$%&#])/g,"$1")
    .replace(/[{}]/g,"").replace(/\s+([,.;])/g,"$1").replace(/[ \t]{2,}/g," ").trim();
}
function solutionQuestionMarkup(item,editable,manualMode=false){
  const rubric=Array.isArray(item.rubric)?item.rubric:[];
  const rubricText=rubric.map(row=>`${solutionMathText(row.criterion)} (${row.points} điểm)`).join("\n")||"Chưa có rubric chi tiết.";
  const uncertainty=String(item.uncertainty||"").trim();
  const showUncertainty=uncertainty&&!/^(none|null|undefined|n\/a)$/i.test(uncertainty);
  const rawAiAnswer=String(item.aiAnswer??item.answer??"").trim();
  const aiAnswer=/^(none|null|undefined)$/i.test(rawAiAnswer)?"":solutionMathText(rawAiAnswer);
  const type=String(item.type||"").toLowerCase();
  const maxPts=Number(item.maximumPoints)||(type==="essay"?0.5:0.25);
  const answer=String(item.answer||"");
  let answerEditor;
  if(type==="multiple_choice"){
    const choice=answer.trim().toUpperCase();const selected=["A","B","C","D"].includes(choice)?choice:"";
    answerEditor=`<input data-solution-answer type="hidden" value="${esc(selected)}" ${editable?"":"disabled"}><div class="solution-answer-choice-group solution-answer-choice-group-four" role="group" aria-label="Chọn đáp án A, B, C hoặc D">${["A","B","C","D"].map(option=>`<button type="button" class="solution-answer-choice ${selected===option?"is-selected":""}" data-solution-option="${option}" aria-pressed="${selected===option}" ${editable?"":"disabled"}>${option}</button>`).join("")}</div>`;
  }else if(type==="true_false"){
    const normalized=answer.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const selected=["true","dung","d","t"].includes(normalized)?"true":["false","sai","s","f"].includes(normalized)?"false":"";
    answerEditor=`<input data-solution-answer type="hidden" value="${selected}" ${editable?"":"disabled"}><div class="solution-answer-choice-group solution-answer-choice-group-two" role="group" aria-label="Chọn Đúng hoặc Sai">${[["true","Đúng"],["false","Sai"]].map(([option,label])=>`<button type="button" class="solution-answer-choice ${selected===option?"is-selected":""}" data-solution-option="${option}" aria-pressed="${selected===option}" ${editable?"":"disabled"}>${label}</button>`).join("")}</div>`;
  }else{
    answerEditor=`<input data-solution-answer type="text" placeholder="Nhập đáp án chuẩn (ví dụ: 12,5 hoặc -3)..." value="${esc(solutionMathText(answer))}" ${editable?"":"disabled"}>`;
  }
  const leftPane=manualMode
    ?`<section class="solution-review-pane solution-review-manual-index"><h4>MÃ CÂU</h4><p class="solution-manual-question-id"><strong>${esc(solutionMathText(item.targetId||"Câu hỏi"))}</strong></p></section>`
    :`<section class="solution-review-pane"><h4>ĐỀ VÀ LỜI GIẢI AI</h4><p class="solution-math-content"><strong>${esc(solutionMathText(item.questionText||""))}</strong></p><p><strong>AI chọn:</strong> ${esc(aiAnswer||"Chưa có đáp án")}</p>${item.referenceAnswer?`<p class="muted"><strong>File đáp án đối chiếu:</strong> ${esc(solutionMathText(item.referenceAnswer))}</p>`:""}<p class="solution-math-content">${esc(solutionMathText(item.explanation||"AI chưa tạo lời giải chi tiết."))}</p><p class="muted tiny"><strong>Rubric AI:</strong><br>${esc(rubricText)}</p>${showUncertainty?`<p class="auth-error">${esc(solutionMathText(uncertainty))}</p>`:""}</section>`;
  const reviewControls=editable?(manualMode
    ?`<div class="solution-review-controls"><span class="answer-key-status">Đáp án thủ công sẽ được lưu sau khi bấm “Lưu đáp án chuẩn đã duyệt”.</span></div>`
    :`<div class="solution-review-controls"><button type="button" class="button secondary small" data-solution-decision="incorrect">Sai, tôi đã sửa</button><button type="button" class="button secondary small" data-solution-decision="correct">Đúng</button><span class="answer-key-status" data-solution-decision-label>Chưa xác nhận</span></div>`)
    :`<div class="solution-review-controls"><span class="answer-key-status is-ready">${item.reviewStatus==="corrected"?"Admin đã sửa":item.reviewStatus==="manual"?"Đã nhập thủ công":"Đã xác nhận chuẩn"}</span></div>`;
  const answerPane=`<section class="solution-review-pane ${manualMode?"solution-review-manual-answer":""}"><h4>${editable?"ĐÁP ÁN GIẢNG VIÊN / ADMIN XÁC NHẬN":"ĐÁP ÁN ĐÃ DUYỆT"}</h4><label>Đáp án chuẩn${answerEditor}</label>${manualMode?"":`<label>Lời giải / ghi chú<textarea data-solution-explanation ${editable?"":"disabled"}>${esc(solutionMathText(item.explanation||""))}</textarea></label><label>Rubric theo tiêu chí (JSON)<textarea data-solution-rubric ${editable?"":"disabled"}>${esc(JSON.stringify((rubric.length?rubric:[{criterion:`Đáp án đúng cho câu ${item.targetId}`,points:maxPts}]).map(row=>({...row,criterion:solutionMathText(row.criterion)})),null,2))}</textarea></label>`}</section>`;
  return `<article class="solution-review-item ${manualMode?"is-manual-solution-review":""}" data-solution-item="${esc(item.targetId)}" data-max-points="${esc(maxPts)}" data-original-answer="${esc(item.answer||"")}">
    <div class="solution-review-head"><h3>${esc(item.targetId)}${manualMode?"":` · ${esc(item.type||"")}`}</h3><span class="answer-key-status ${manualMode?"":Number(item.confidence)<0.7?"is-missing":""}">${manualMode?"Nhập thủ công":`AI tin cậy ${Math.round((Number(item.confidence)||0)*100)}%${showUncertainty?" · Cần kiểm tra":""}`}</span></div>
    <div class="solution-review-grid ${manualMode?"solution-review-grid-manual":""}">${leftPane}${answerPane}</div>
    ${reviewControls}
  </article>`;
}
function setSolutionReviewReady(){
  const dialog=$("#exam-solution-dialog"),save=dialog?.querySelector("[data-solution-save]");
  if(!dialog||!save)return;
  const items=[...dialog.querySelectorAll("[data-solution-item]")];
  const manualMode=dialog.dataset.solutionMode==="manual";
  save.disabled=!items.length;
  if(items.length){
    const readyCount=items.filter(item=>(manualMode||Boolean(item.dataset.decision))&&Boolean(item.querySelector("[data-solution-answer]")?.value.trim())).length;
    save.textContent=readyCount===items.length
      ?"Lưu đáp án chuẩn đã duyệt"
      :`Lưu đáp án chuẩn đã duyệt (${readyCount}/${items.length})`;
  }else{
    save.textContent="Lưu đáp án chuẩn đã duyệt";
  }
}
function renderSolutionState(data){
  const dialog=$("#exam-solution-dialog");if(!dialog)return;
  const title=dialog.querySelector("[data-solution-title]"),status=dialog.querySelector("[data-solution-status]"),bar=dialog.querySelector("[data-solution-progress]"),label=dialog.querySelector("[data-solution-progress-label]"),error=dialog.querySelector("[data-solution-error]"),content=dialog.querySelector("[data-solution-review-content]"),retry=dialog.querySelector("[data-solution-retry]"),save=dialog.querySelector("[data-solution-save]"),download=dialog.querySelector("[data-solution-download]");
  const switchAiBtn=dialog.querySelector("[data-solution-switch-ai]"),switchManualBtn=dialog.querySelector("[data-solution-switch-manual]"),approveAllBtn=dialog.querySelector("[data-solution-approve-all]");
  activeSolutionId=data.id;
  if(title)title.textContent=data.title||"Lời giải đề thi";
  if(status)status.textContent=solutionLabel(data.status)+(data.phase&&data.phase!==solutionLabel(data.status)?` · ${data.phase}`:"");
  if(bar)bar.value=Number(data.progress)||0;if(label)label.textContent=`${Number(data.progress)||0}%`;
  if(error){error.hidden=!data.errorMessage;error.textContent=data.errorMessage||"";}
  const ready=data.status==="review",approved=data.status==="ready";
  const activePayload=approved?(data.approved||data.generated):(data.generated||data.approved);
  const manualMode=activePayload?.source==="manual-entry"||data.model==="Nhập thủ công"||data.phase==="Nhập đáp án thủ công";
  dialog.dataset.solutionMode=manualMode?"manual":"ai";
  if(title&&manualMode)title.textContent=`${data.title||"Đề thi"} · Nhập đáp án thủ công`;
  if(switchAiBtn){
    switchAiBtn.classList.toggle("primary",!manualMode&&data.status!=="not_started");
    switchAiBtn.classList.toggle("secondary",manualMode||data.status==="not_started");
    switchAiBtn.disabled=["queued","reading","solving"].includes(data.status);
  }
  if(switchManualBtn){
    switchManualBtn.classList.toggle("primary",manualMode);
    switchManualBtn.classList.toggle("secondary",!manualMode);
  }
  const items=activePayload?.questions;
  if(approveAllBtn){
    approveAllBtn.hidden=!(ready&&!manualMode&&Array.isArray(items)&&items.length>0);
  }
  if(content){
    if(Array.isArray(items)&&items.length){
      const reqCount=activePayload?.requiredCount||items.length;
      const ansCount=activePayload?.answerCount??items.filter(q=>String(q?.answer||"").trim()).length;
      content.innerHTML=`<p class="muted">${approved?"Bộ đáp án chuẩn đã được xác nhận. Bạn có thể bấm “🤖 AI giải đề & Duyệt lại” hoặc “✍️ Nhập đáp án thủ công” ở trên nếu muốn chỉnh sửa lại.":manualMode?`Chế độ nhập thủ công: điền đáp án cho ${reqCount} mục theo mã câu. Không gọi AI.`:`AI tạo ${ansCount}/${reqCount} đáp án. Đối chiếu từng câu với đề và nguồn đáp án (hoặc bấm “✓ Xác nhận nhanh tất cả đáp án AI”) trước khi lưu.`}${data.model?` · ${esc(data.model)}`:""}</p><p>${data.originalName?`<a class="text-button" href="/api/documents/${encodeURIComponent(data.id)}/file" target="_blank" rel="noopener">Mở đề gốc</a>`:""}${data.referenceAnswerName?` · <a class="text-button" href="/api/admin/documents/${encodeURIComponent(data.id)}/answer-key" target="_blank" rel="noopener">Mở file đáp án tham chiếu (${esc(data.referenceAnswerName)})</a>`:""}</p>${items.map(item=>solutionQuestionMarkup(item,ready,manualMode)).join("")}`;
    }else content.innerHTML="";
  }
  if(retry)retry.hidden=data.status!=="failed"&&data.status!=="not_started";
  if(save)save.hidden=!ready;
  if(download){download.hidden=!activePayload;download.href=`/api/admin/documents/${encodeURIComponent(data.id)}/solution?download=json`;download.setAttribute("download",`loi-giai-${data.id}.json`);}
  setSolutionReviewReady();
  if(["queued","reading","solving"].includes(data.status)){
    clearTimeout(solutionPollTimer);solutionPollTimer=setTimeout(()=>loadSolutionState(data.id),1200);
  }else clearTimeout(solutionPollTimer);
}
async function loadSolutionState(id){
  try{renderSolutionState(await request(`/api/admin/documents/${encodeURIComponent(id)}/solution`));}
  catch(error){showSolutionLoadError(error);}
}
function showSolutionLoadError(error){
  const dialog=$("#exam-solution-dialog");if(!dialog)return;
  clearTimeout(solutionPollTimer);
  const title=dialog.querySelector("[data-solution-title]"),status=dialog.querySelector("[data-solution-status]"),bar=dialog.querySelector("[data-solution-progress]"),label=dialog.querySelector("[data-solution-progress-label]"),node=dialog.querySelector("[data-solution-error]"),retry=dialog.querySelector("[data-solution-retry]"),save=dialog.querySelector("[data-solution-save]");
  if(title)title.textContent="Không tải được lời giải";
  if(status)status.textContent="Không kết nối được API lời giải";
  if(bar)bar.value=0;
  if(label)label.textContent="Lỗi";
  if(node){node.hidden=false;node.textContent=error?.message||"Không tải được trạng thái lời giải.";}
  if(retry)retry.hidden=false;
  if(save)save.hidden=true;
}
async function openSolutionDialog(id, preferredMode=null){
  const dialog=$("#exam-solution-dialog");if(!dialog)return;
  activeSolutionId=String(id);dialog.querySelector("[data-solution-title]").textContent="Đang tải lời giải";
  dialog.querySelector("[data-solution-review-content]").replaceChildren();dialog.querySelector("[data-solution-error]").hidden=true;
  if(!dialog.open)dialog.showModal();
  try{
    let data=await request(`/api/admin/documents/${encodeURIComponent(id)}/solution`);
    const isAlreadyManualReview=data.status==="review"&&(data.model==="Nhập thủ công"||data.phase==="Nhập đáp án thủ công"||data.generated?.source==="manual-entry");
    const isAlreadyAiRunningOrReview=["queued","reading","solving"].includes(data.status)||(data.status==="review"&&!isAlreadyManualReview);
    if(preferredMode==="manual"&&!isAlreadyManualReview){
      await request(`/api/admin/documents/${encodeURIComponent(id)}/solution/manual`,{method:"POST"});
      data=await request(`/api/admin/documents/${encodeURIComponent(id)}/solution`);
    }else if(preferredMode==="ai"&&!isAlreadyAiRunningOrReview){
      await request(`/api/admin/documents/${encodeURIComponent(id)}/solution/generate`,{method:"POST"});
      data=await request(`/api/admin/documents/${encodeURIComponent(id)}/solution`);
    }else if(data.status==="not_started"&&preferredMode!=="manual"){
      await request(`/api/admin/documents/${encodeURIComponent(id)}/solution/generate`,{method:"POST"});
      data=await request(`/api/admin/documents/${encodeURIComponent(id)}/solution`);
    }
    renderSolutionState(data);
  }catch(error){showSolutionLoadError(error);}
}
window.addEventListener("maihoc-exam-solution-job",event=>{
  if(activeUser?.role==="admin"&&event.detail?.id){
    openSolutionDialog(event.detail.id, event.detail.preferredMode||event.detail.mode||null);
  }
});
document.addEventListener("click",event=>{
  const option=event.target.closest("[data-solution-option]");if(!option||option.disabled)return;
  const item=option.closest("[data-solution-item]");const answer=item?.querySelector("[data-solution-answer]");if(!item||!answer)return;
  answer.value=option.dataset.solutionOption;
  item.querySelectorAll("[data-solution-option]").forEach(button=>{const selected=button===option;button.classList.toggle("is-selected",selected);button.setAttribute("aria-pressed",String(selected));});
  answer.dispatchEvent(new Event("input",{bubbles:true}));
});
document.addEventListener("input",event=>{
  const item=event.target.closest("[data-solution-item]");if(!item)return;
  if(item.dataset.decision){delete item.dataset.decision;const label=item.querySelector("[data-solution-decision-label]");if(label){label.textContent="Đã sửa nội dung; xác nhận lại Đúng / Sai";label.classList.remove("decision-status-correct","decision-status-incorrect");}const controls=item.querySelector(".solution-review-controls");controls?.classList.remove("decision-confirmed-correct","decision-confirmed-incorrect");item.querySelectorAll("[data-solution-decision]").forEach(button=>button.classList.remove("is-selected","decision-button-correct","decision-button-incorrect"));}
  setSolutionReviewReady();
});
async function loadAdminProgress(){
 const box=$("#admin-progress-list");if(!box)return;
 try{
   const data=await request("/api/admin/progress");
   const rows=data.progress||[];
   if(!rows.length){box.innerHTML='<p class="muted">Chưa có tiến trình được ghi nhận.</p>';return;}
   const table=document.createElement("table");table.className="admin-table";
   table.innerHTML="<thead><tr><th>Học sinh</th><th>Nội dung</th><th>Môn/Lớp</th><th>Trạng thái</th><th>Tiến trình</th><th>Cập nhật</th><th>Kết quả</th></tr></thead>";
   const body=document.createElement("tbody");
   rows.forEach(p=>{
     const tr=document.createElement("tr");
     const statusLabel = p.status === "completed" ? "Đã hoàn thành" : "Chưa hoàn thành";
     [p.userName+" ("+p.userEmail+")",p.itemType+" · "+(p.itemTitle||p.itemId),p.subject+" · "+p.grade,statusLabel,Number(p.progressPercent)+"%",p.updatedAt].forEach(value=>{
       const td=document.createElement("td");td.textContent=String(value??"");tr.append(td);
     });
     const actionCell=document.createElement("td");
     if(p.itemType==="test"&&p.testSubmissionId){
       const link=document.createElement("button");link.type="button";
       link.className="button secondary small";
       link.dataset.action="view-test-submission";link.dataset.id=String(p.testSubmissionId);
       link.textContent=p.gradingStatus==="pending_grade"?"Đang chờ chấm":"Xem kết quả";
       actionCell.append(link);
     }else if((p.itemType==="exam"||p.itemType==="test")&&p.latestAttemptId){
       const link=document.createElement("button");link.type="button";link.className="button secondary small";
       link.dataset.action="view-exam-result";link.dataset.id=String(p.latestAttemptId);link.textContent="Xem kết quả";
       actionCell.append(link);
     }else actionCell.textContent="—";
     tr.append(actionCell);body.append(tr);
   });
   table.append(body);
   const wrap=document.createElement("div");wrap.className="admin-table-wrap admin-progress-scroll";wrap.setAttribute("role","region");wrap.setAttribute("aria-label","Danh sách tiến trình học tập");wrap.tabIndex=0;wrap.append(table);box.replaceChildren(wrap);
 }catch(e){box.textContent=e.message||"Không tải được tiến trình.";box.classList.add("auth-error");}
}
async function loadSubmissions() {
  const box=$("#pending-submissions");if(!box)return;
  try {
    const data=await request("/api/admin/submissions");
    box.innerHTML=(data.submissions||[]).length?'<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Tài liệu</th><th>Người gửi</th><th>Phân loại</th><th>Ngày gửi</th><th>Thao tác</th></tr></thead><tbody>'+data.submissions.map(s=>'<tr><td><strong>'+esc(s.title)+'</strong><br><span class="muted tiny">'+esc(s.originalName)+' · '+Math.ceil(s.size/1024)+' KB</span>'+(s.answerKeyOriginalName?'<br><span class="answer-key-status is-ready">Kèm đáp án: '+esc(s.answerKeyOriginalName)+'</span>':'')+'</td><td>'+esc(s.userName)+'<br><span class="muted tiny">'+esc(s.userEmail)+'</span></td><td>'+esc(s.subject)+' · Lớp '+esc(s.grade)+'<br>'+esc(s.category)+'</td><td>'+esc(s.createdAt)+'</td><td><button class="button primary small" data-review-id="'+s.id+'" data-review-decision="approved">Duyệt</button> <button class="button secondary small" data-review-id="'+s.id+'" data-review-decision="rejected">Từ chối</button></td></tr>').join("")+'</tbody></table></div>':'<p class="muted">Không có tài liệu chờ duyệt.</p>';
  } catch(e) {box.innerHTML='<p class="auth-error">'+esc(e.message)+'</p>';}
}
document.addEventListener("click",async e=>{
  const solutionManual=e.target.closest("[data-solution-manual]");
  if(solutionManual){
    const id=solutionManual.dataset.solutionManual;
    try{
      await openSolutionDialog(id, "manual");
      await loadAnswerKeySections();
      window.dispatchEvent(new Event("maihoc-tests-rerender"));
      window.dispatchEvent(new Event("maihoc-admin-panel-mounted"));
    }catch(error){toastNotice(error.message||"Không thể mở chế độ nhập đáp án thủ công.","error");}
    return;
  }
  const solutionGenerate=e.target.closest("[data-solution-generate]");
  if(solutionGenerate){
    const id=solutionGenerate.dataset.solutionGenerate;
    try{
      await openSolutionDialog(id, "ai");
      await loadAnswerKeySections();
      window.dispatchEvent(new Event("maihoc-tests-rerender"));
      window.dispatchEvent(new Event("maihoc-admin-panel-mounted"));
    }catch(error){toastNotice(error.message||"Không thể khởi chạy AI giải đề.","error");}
    return;
  }
  const solutionOpen=e.target.closest("[data-solution-open]");
  if(solutionOpen){openSolutionDialog(solutionOpen.dataset.solutionOpen);return;}
  if(e.target.closest("[data-solution-switch-ai]")){
    if(!activeSolutionId)return;
    try{
      await request(`/api/admin/documents/${encodeURIComponent(activeSolutionId)}/solution/generate`,{method:"POST"});
      await loadSolutionState(activeSolutionId);
      await loadAnswerKeySections();
      window.dispatchEvent(new Event("maihoc-tests-rerender"));
      window.dispatchEvent(new Event("maihoc-admin-panel-mounted"));
      toastNotice("Đã chuyển sang chế độ AI giải đề -> Giáo viên duyệt lại.","success");
    }catch(error){
      const node=$("[data-solution-error]");if(node){node.hidden=false;node.textContent=error.message;}
    }
    return;
  }
  if(e.target.closest("[data-solution-switch-manual]")){
    if(!activeSolutionId)return;
    try{
      await request(`/api/admin/documents/${encodeURIComponent(activeSolutionId)}/solution/manual`,{method:"POST"});
      await loadSolutionState(activeSolutionId);
      await loadAnswerKeySections();
      window.dispatchEvent(new Event("maihoc-tests-rerender"));
      window.dispatchEvent(new Event("maihoc-admin-panel-mounted"));
      toastNotice("Đã chuyển sang chế độ Nhập đáp án thủ công.","success");
    }catch(error){
      const node=$("[data-solution-error]");if(node){node.hidden=false;node.textContent=error.message;}
    }
    return;
  }
  if(e.target.closest("[data-solution-approve-all]")){
    const dialog=$("#exam-solution-dialog");if(!dialog)return;
    const items=[...dialog.querySelectorAll("[data-solution-item]")];
    let firstMissing=null;
    for(const item of items){
      const answer=item.querySelector("[data-solution-answer]");
      if(!answer?.value?.trim()&&item.dataset.originalAnswer){
        answer.value=item.dataset.originalAnswer;
      }
      if(answer?.value?.trim()){
        item.dataset.decision="correct";
        const label=item.querySelector("[data-solution-decision-label]");
        if(label){
          label.textContent="Đã xác nhận đúng";
          label.classList.add("decision-status-correct");
          label.classList.remove("decision-status-incorrect");
        }
        const controls=item.querySelector(".solution-review-controls");
        if(controls){
          controls.classList.add("decision-confirmed-correct");
          controls.classList.remove("decision-confirmed-incorrect");
        }
        item.querySelectorAll("[data-solution-decision]").forEach(btn=>{
          const isCorr=btn.dataset.solutionDecision==="correct";
          btn.classList.toggle("is-selected",isCorr);
          btn.classList.toggle("decision-button-correct",isCorr);
          btn.classList.remove("decision-button-incorrect");
        });
      }else if(!firstMissing){
        firstMissing=item;
      }
    }
    setSolutionReviewReady();
    if(firstMissing){
      firstMissing.scrollIntoView({behavior:"smooth",block:"center"});
      toastNotice(`Đã xác nhận các câu có sẵn đáp án. Vui lòng điền bổ sung câu ${firstMissing.dataset.solutionItem}.`, "error");
    }else{
      toastNotice("Đã xác nhận Đúng cho tất cả đáp án AI. Bạn có thể bấm Lưu đáp án chuẩn đã duyệt.", "success");
    }
    return;
  }
  const decisionButton=e.target.closest("[data-solution-decision]");
  if(decisionButton){
    const item=decisionButton.closest("[data-solution-item]");
    item.dataset.decision=decisionButton.dataset.solutionDecision;
    const label=item.querySelector("[data-solution-decision-label]");
    if(label){
      label.textContent=decisionButton.dataset.solutionDecision==="correct"?"Đã xác nhận đúng":"Đã xác nhận sai; kiểm tra đáp án đã sửa";
      label.classList.toggle("decision-status-correct",decisionButton.dataset.solutionDecision==="correct");
      label.classList.toggle("decision-status-incorrect",decisionButton.dataset.solutionDecision==="incorrect");
    }
    const controls=item.querySelector(".solution-review-controls");
    if(controls){
      controls.classList.toggle("decision-confirmed-correct",decisionButton.dataset.solutionDecision==="correct");
      controls.classList.toggle("decision-confirmed-incorrect",decisionButton.dataset.solutionDecision==="incorrect");
    }
    item.querySelectorAll("[data-solution-decision]").forEach(button=>{
      button.classList.toggle("is-selected",button===decisionButton);
      button.classList.toggle("decision-button-correct",button===decisionButton&&decisionButton.dataset.solutionDecision==="correct");
      button.classList.toggle("decision-button-incorrect",button===decisionButton&&decisionButton.dataset.solutionDecision==="incorrect");
    });
    const answer=item.querySelector("[data-solution-answer]");
    if(decisionButton.dataset.solutionDecision==="incorrect"&&answer.value===item.dataset.originalAnswer)answer.value="";
    if(decisionButton.dataset.solutionDecision==="correct"&&!answer.value)answer.value=item.dataset.originalAnswer;
    setSolutionReviewReady();return;
  }
  if(e.target.closest("[data-solution-retry]")){
    if(!activeSolutionId)return;
    try{await request(`/api/admin/documents/${encodeURIComponent(activeSolutionId)}/solution/generate`,{method:"POST"});await loadSolutionState(activeSolutionId);}
    catch(error){const node=$("[data-solution-error]");node.hidden=false;node.textContent=error.message;}
    return;
  }
  if(e.target.closest("[data-solution-save]")){
    if(!activeSolutionId)return;
    const button=e.target.closest("[data-solution-save]");button.disabled=true;
    const errNode=$("[data-solution-error]");if(errNode)errNode.hidden=true;
    try{
      const dialog=$("#exam-solution-dialog");
      const manualMode=dialog.dataset.solutionMode==="manual";
      const items=[...dialog.querySelectorAll("[data-solution-item]")];
      for(const item of items){
        const targetId=item.dataset.solutionItem;
        const ansVal=String(item.querySelector("[data-solution-answer]")?.value||"").trim();
        if(!ansVal){
          item.scrollIntoView({behavior:"smooth",block:"center"});
          throw new Error(`Thiếu đáp án chuẩn cho câu ${targetId}. Vui lòng chọn hoặc nhập đáp án vào câu ${targetId} trước khi lưu.`);
        }
        if(!manualMode&&!item.dataset.decision){
          item.scrollIntoView({behavior:"smooth",block:"center"});
          throw new Error(`Câu ${targetId} chưa được xác nhận. Hãy bấm “Đúng” / “Sai, tôi đã sửa” ở câu ${targetId}, hoặc bấm “✓ Xác nhận nhanh tất cả đáp án AI” ở thanh phía trên.`);
        }
      }
      const questions=items.map(item=>{
        const targetId=item.dataset.solutionItem;
        const answerVal=String(item.querySelector("[data-solution-answer]")?.value||"").trim();
        const explanationEl=item.querySelector("[data-solution-explanation]");
        const rubricEl=item.querySelector("[data-solution-rubric]");
        const maxPts=Number(item.dataset.maxPoints)||0.25;
        let rubric=[];
        if(rubricEl&&rubricEl.value.trim()){
          try{rubric=JSON.parse(rubricEl.value);}catch{throw new Error(`Rubric ${targetId} phải là JSON hợp lệ.`);}
        }else{
          rubric=[{criterion:`Đáp án đúng cho câu ${targetId}: ${answerVal}`,points:maxPts}];
        }
        return {
          targetId,
          decision:manualMode?"manual":(item.dataset.decision||"correct"),
          answer:answerVal,
          explanation:explanationEl?explanationEl.value.trim():"",
          rubric
        };
      });
      const saveRes=await request(`/api/admin/documents/${encodeURIComponent(activeSolutionId)}/solution/review`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({questions})});
      await loadSolutionState(activeSolutionId);await loadAnswerKeySections();
      window.dispatchEvent(new Event("maihoc-tests-rerender"));
      window.dispatchEvent(new Event("maihoc-admin-panel-mounted"));
      const autoGradeNote=Number(saveRes?.regradedSubmissionsCount)>0
        ?` (Đã tự động chấm điểm ${saveRes.regradedSubmissionsCount} bài nộp của học viên)`
        :"";
      toastNotice((manualMode?"Đã lưu bộ đáp án nhập thủ công.":"Đã lưu bộ đáp án chuẩn theo xác nhận của giáo viên / admin.")+autoGradeNote,"success");
    }catch(error){if(errNode){errNode.hidden=false;errNode.textContent=error.message;}}
    finally{setSolutionReviewReady();}
    return;
  }
  if(e.target.closest("[data-answer-key-open]")){
    const dialog=$("#answer-key-dialog");
    if(dialog&&!dialog.open)dialog.showModal();
    loadAnswerKeySections();
  }
  const deleteDocument=e.target.closest("[data-delete-document]");
  if(deleteDocument){
    const id=deleteDocument.dataset.deleteDocument;
    if(!confirm("Bạn có chắc muốn xóa tài liệu này?"))return;
    try{
      await request("/api/admin/documents/"+encodeURIComponent(id),{method:"DELETE"});
      const key="maihoc-uploaded-docs";
      const cached=JSON.parse(localStorage.getItem(key)||"[]");
      localStorage.setItem(key,JSON.stringify(cached.filter(d=>String(d.id)!==String(id))));
      toastNotice("Đã xóa tài liệu.");
      loadApprovedDocuments();
      
      window.dispatchEvent(new Event("maihoc-documents-changed"));
    }catch(error){toastNotice(error.message,"error");}
  }

  if(e.target.closest("#notifications-open")){await refreshNotifications();const d=$("#notifications-dialog");if(d&&!d.open)d.showModal();}
  const read=e.target.closest("[data-notification-read]");
  if(read){try{await request("/api/notifications/"+read.dataset.notificationRead+"/read",{method:"POST"});refreshNotifications();}catch(err){toastNotice(err.message,"error");}}
  if(e.target.closest("#notifications-read-all")){try{await request("/api/notifications/read-all",{method:"POST"});refreshNotifications();}catch(err){toastNotice(err.message,"error");}}
  const deleteAllNotifications=e.target.closest("#notifications-delete-all");
  if(deleteAllNotifications){
    if(!confirm("Xóa toàn bộ thông báo của tài khoản này? Thao tác này không thể hoàn tác."))return;
    deleteAllNotifications.disabled=true;
    try{await request("/api/notifications",{method:"DELETE"});await refreshNotifications();toastNotice("Đã xóa toàn bộ thông báo.");}
    catch(err){toastNotice(err.message,"error");}
    finally{deleteAllNotifications.disabled=false;}
  }
  const review=e.target.closest("[data-review-id]");
  if(review){const decision=review.dataset.reviewDecision;const note=decision==="rejected"?(prompt("Lý do từ chối (không bắt buộc):")||""):"";try{await request("/api/admin/submissions/"+review.dataset.reviewId+"/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision,note})});toastNotice(decision==="approved"?"Đã duyệt tài liệu.":"Đã từ chối tài liệu.");loadSubmissions();refreshNotifications();if(decision==="approved")window.dispatchEvent(new Event("maihoc-documents-changed"));}catch(err){toastNotice(err.message,"error");}}
  const startExam=e.target.closest('[data-action="start-exam"]');
  if(startExam&&activeUser){const card=startExam.closest(".exam-card, .resource-row, .reader-main");saveProgress({itemType:"exam",itemId:startExam.dataset.id,itemTitle:card?.querySelector("h3, h1")?.textContent||startExam.dataset.id,subject:"Toán",grade:"10",status:"in_progress",progressPercent:1,lastPosition:"1"});}
});

document.addEventListener("DOMContentLoaded",loadUser);
fetch("/api/documents").then(r=>r.ok?r.json():[]).then(list=>{if(!Array.isArray(list))return;const key="maihoc-uploaded-docs";const existing=JSON.parse(localStorage.getItem(key)||"[]");const known=new Set(existing.map(d=>d.id));for(const d of list){if(!known.has(d.id))existing.push({...d,sample:false,description:d.originalName||"Tài liệu đã được Admin duyệt"});}localStorage.setItem(key,JSON.stringify(existing));}).catch(()=>{});

let bodyMutationTimer = null;
const observer = new MutationObserver((mutations) => {
  if (bodyMutationTimer) clearTimeout(bodyMutationTimer);
  bodyMutationTimer = setTimeout(() => {
  if(activeUser?.role==="admin" && $("#admin-users-table") && !$("#admin-review-panel")) addAdminReviewPanel();
  const reader=$("#reader-layout");
  if(reader&&activeUser&&(activeReader?.id!==reader.dataset.readerId||activeReaderRoot!==reader))startReaderTracking(reader);
  else if(!reader&&activeReader){readerMaxProgress=Math.max(readerMaxProgress,Math.min(100,measureReaderProgress(activeReaderRoot)));const payload=readerPayload(readerMaxProgress===100?"completed":"in_progress");if(payload)saveProgress(payload);activeReaderCleanup?.();activeReaderCleanup=null;activeReader=null;activeReaderRoot=null;clearTimeout(readerSaveTimer);}
}, 150); // Gom mọi biến động DOM trong 150ms thành 1 lần thực thi duy nhất
});
observer.observe(document.body, { childList: true, subtree: true })

// Tăng chu kỳ kiểm tra phiên từ 45 giây lên 120 giây (2 phút) và không chạy khi tab đang ẩn
setInterval(() => {
  if (!document.hidden) {
    loadUser();
  }
}, 120000);
loadUser();
window.addEventListener("maihoc-auth-changed",loadUser);


window.addEventListener("maihoc-account-center-open", () => {
  if (activeUser?.role === "admin") return;
  loadAccountCenterProgress();
  loadAccountAiHistory();
});
window.addEventListener("maihoc-ai-solution-saved", () => {
  if ($("#account-ai-history-list") && activeUser?.role !== "admin") loadAccountAiHistory();
});
document.addEventListener("click", async event => {
  const link = event.target.closest("[data-ai-history-open]");
  if (!link) return;
  event.preventDefault();
  await openSavedAiSolution(link.dataset.aiHistoryOpen);
});
window.addEventListener("maihoc-route-changed", event => {
  const route = event.detail?.route || "home";
  currentRouteActivity = routeToActivityLabel(route);
  refreshOnlineDashboard();
});
window.addEventListener("maihoc-exam-progress", event => {
  if (!activeUser) return;
  const d = event.detail || {};
  if (!d.id) return;
  clearTimeout(examProgressTimer);
  examProgressTimer = setTimeout(() => {
    saveProgress({
      itemType: "exam",
      itemId: String(d.id),
      itemTitle: d.title || String(d.id),
      subject: d.subject || "Toán",
      grade: d.grade || "10",
      status: "in_progress",
      progressPercent: Number(d.percent) || 1,
      answers: d.answers || {},
      lastPosition: String(d.percent || 1)
    });
  }, 400);
});
if (localStorage.getItem("maihoc-online-sidebar-collapsed") === "1") {
  $("#app-body")?.classList.add("online-sidebar-collapsed");
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshOnlineDashboard();
    if ($("#account-progress-list") && activeUser && activeUser.role !== "admin") loadAccountCenterProgress();
    if ($("#account-ai-history-list") && activeUser && activeUser.role !== "admin") loadAccountAiHistory();
  }
});



let isDashboardRefreshing = false;

async function throttledRefreshOnlineDashboard() {
  // Không gửi request nếu người dùng đang ẩn tab hoặc request cũ chưa chạy xong
  if (document.hidden || isDashboardRefreshing) return;

  isDashboardRefreshing = true;
  try {
    await refreshOnlineDashboard();
  } catch (err) {
    console.debug('[Polling] Skip dashboard refresh:', err);
  } finally {
    isDashboardRefreshing = false;
  }
}

// Cập nhật nhanh, bỏ qua tab ẩn và request đang chạy.
setInterval(throttledRefreshOnlineDashboard, 10000);

// Tự động cập nhật ngay khi người dùng mở lại tab
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    throttledRefreshOnlineDashboard();
  }
});
// The online list is a dismissible panel, independent of the current route.
function setOnlineDrawer(open) {
  const panel = document.getElementById('online-dashboard');
  const toggle = document.getElementById('online-drawer-toggle');
  if (!panel || !toggle) return;
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.classList.toggle('active', open);
  if (open) { panel.focus(); throttledRefreshOnlineDashboard(); }
  else toggle.focus();
}
document.addEventListener('click', event => {
  if (event.target.closest('#online-drawer-toggle')) {
    setOnlineDrawer(document.getElementById('online-dashboard')?.hidden);
  } else if (event.target.closest('#online-drawer-close')) setOnlineDrawer(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.getElementById('online-dashboard')?.hidden) setOnlineDrawer(false);
});
