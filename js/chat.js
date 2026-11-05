import { canAccessSchool } from './platform/school-access.js';
// ====================================================
// MAI HỌC Real-time Chat Frontend Module
// Features: Global Room + 1-1 Direct Messages
// ====================================================

(function () {
  let socket = null;
  let currentUser = null;
  let activeTab = "global"; // "global" | "direct"
  let activeDirectConv = null; // { id, partner: { id, name, isOnline } }
  let conversationsMap = new Map(); // convId => convObject
  let unreadCounts = { global: 0, directTotal: 0 };
  let typingTimeout = null;
  let isTyping = false;
  let isWindowOpen = false;
  let pendingGlobalAttachment = null;
  let pendingGlobalPreviewUrl = "";

  // DOM Elements cache
  let dom = {};
  setInterval(() => {
    document.querySelectorAll('.chat-message-group[data-expires-at]').forEach(node => {
      if (Number(node.dataset.expiresAt) <= Date.now()) node.remove();
    });
    if (currentUser && isWindowOpen) loadConversations();
  }, 30000);

  // Safe element creator helper
  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // Format time in Vietnam timezone (HH:mm or DD/MM HH:mm)
  function formatChatTime(dateStr) {
    if (!dateStr) return "";
    try {
      // Normalize SQLite date string (UTC)
      const normalized = String(dateStr).includes("Z") ? dateStr : String(dateStr).replace(" ", "T") + "Z";
      const date = new Date(normalized);
      if (isNaN(date.getTime())) return "";

      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });

      if (isToday) {
        return timeFormatter.format(date);
      }

      const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit"
      });

      return `${timeFormatter.format(date)} ${dateFormatter.format(date)}`;
    } catch {
      return "";
    }
  }

  // Get user initials for avatar
  function getInitials(name = "") {
    const parts = String(name).trim().split(/\s+/);
    if (!parts.length) return "M";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // ----------------------------------------------------
  // Render Widget UI Structure
  // ----------------------------------------------------
  function buildWidget() {
    // 1. Launcher button
    const launcher = el("button", "chat-launcher");
    launcher.id = "chat-launcher";
    launcher.setAttribute("aria-label", "Mở khung chat");
    launcher.innerHTML = `
      <svg class="chat-launcher-icon" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24"><path d="M20 11.5a8 8 0 0 1-8 8 8.6 8.6 0 0 1-3.4-.7L4 20l1.2-4.1A7.7 7.7 0 0 1 4 11.5a8 8 0 0 1 8-8 8 8 0 0 1 8 8Z"/><circle cx="9" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="15" cy="12" r=".8"/></svg>

      <span class="chat-unread-badge" id="chat-total-badge" hidden>0</span>
    `;

    // 2. Guest Notice Popover (when not logged in)
    const guestNotice = el("div", "chat-guest-notice");
    guestNotice.id = "chat-guest-notice";
    guestNotice.hidden = true;
    guestNotice.innerHTML = `
      <h3 class="chat-guest-title">Chào mừng bạn đến với MAI HỌC Chat!</h3>
      <p class="chat-guest-desc">Vui lòng đăng nhập để trao đổi bài tập trong phòng học chung và nhắn tin riêng với bạn bè.</p>
      <div class="chat-guest-actions">
        <button type="button" class="button secondary small" id="chat-guest-close">Đóng</button>
        <button type="button" class="button primary small" id="chat-guest-login">Đăng nhập ngay</button>
      </div>
    `;

    // 3. Floating Chat Window
    const windowEl = el("div", "chat-window");
    windowEl.id = "chat-window";
    windowEl.hidden = true;

    windowEl.innerHTML = `
      <!-- Header -->
      <header class="chat-header">
        <div class="chat-header-title-wrap">
          <button type="button" class="chat-back-btn" id="chat-back-btn" aria-label="Quay lại" hidden>←</button>
          <div class="chat-header-info">
            <h2 class="chat-header-title" id="chat-header-title">Phòng học tập chung</h2>
            <div class="chat-header-status">
              <span class="chat-status-dot offline" id="chat-status-dot"></span>
              <span id="chat-status-text">Đang kết nối...</span>
            </div>
          </div>
        </div>
        <div class="chat-header-actions">
          <button type="button" class="chat-action-btn" id="chat-minimize-btn" title="Thu nhỏ" aria-label="Thu nhỏ">–</button>
          <button type="button" class="chat-action-btn" id="chat-close-btn" title="Đóng chat" aria-label="Đóng chat">×</button>
        </div>
      </header>

      <!-- Navigation Tabs -->
      <nav class="chat-tabs" id="chat-tabs">
        <button type="button" class="chat-tab active" data-tab="global">
          <span>💬 Phòng chung</span>
          <span class="chat-tab-badge" id="chat-tab-global-badge" hidden>0</span>
        </button>
        <button type="button" class="chat-tab" data-tab="direct">
          <span>👤 Tin nhắn riêng</span>
          <span class="chat-tab-badge" id="chat-tab-direct-badge" hidden>0</span>
        </button>
      </nav>

      <!-- Main Body -->
      <div class="chat-body">
        <!-- Global Chat Pane -->
        <section class="chat-pane" id="chat-pane-global">
          <div class="chat-messages-container" id="chat-global-messages"></div>
          <div class="chat-typing-indicator" id="chat-global-typing" hidden>
            <div class="chat-typing-dots"><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span></div>
            <span id="chat-global-typing-text">Đang soạn tin...</span>
          </div>
          <div class="chat-attachment-preview" id="chat-global-attachment-preview" hidden></div>
          <div class="chat-input-bar">
            <button type="button" class="chat-attach-btn" id="chat-global-attach" title="Gửi ảnh hoặc tệp" aria-label="Gửi ảnh hoặc tệp">+</button>
            <input type="file" id="chat-global-file" hidden>
            <textarea class="chat-input-field" id="chat-global-input" placeholder="Nhập tin nhắn... (Enter để gửi)" rows="1" maxlength="2000"></textarea>
            <button type="button" class="chat-send-btn" id="chat-global-send" aria-label="Gửi tin nhắn">➤</button>
          </div>
        </section>

        <!-- Direct Messages Pane -->
        <section class="chat-pane" id="chat-pane-direct" hidden>
          <!-- DM Subview 1: Conversations List & User Search -->
          <div class="chat-dm-list-view" id="chat-dm-list-view">
            <div class="chat-search-wrap">
              <input type="text" class="chat-search-input" id="chat-user-search" placeholder="🔍 Tìm bạn học theo tên..." maxlength="80">
            </div>
            <div class="chat-conversations-scroll" id="chat-conversations-list">
              <p class="chat-empty-hint">Đang tải cuộc trò chuyện...</p>
            </div>
          </div>

          <!-- DM Subview 2: 1-1 Chat Conversation -->
          <div class="chat-pane" id="chat-dm-chat-view" hidden>
            <div class="chat-messages-container" id="chat-direct-messages"></div>
            <div class="chat-typing-indicator" id="chat-direct-typing" hidden>
              <div class="chat-typing-dots"><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span></div>
              <span id="chat-direct-typing-text">Đang soạn tin...</span>
            </div>
            <div class="chat-input-bar">
              <textarea class="chat-input-field" id="chat-direct-input" placeholder="Nhập tin nhắn riêng... (Enter để gửi)" rows="1" maxlength="2000"></textarea>
              <button type="button" class="chat-send-btn" id="chat-direct-send" aria-label="Gửi tin nhắn">➤</button>
            </div>
          </div>
        </section>
      </div>
      <dialog class="chat-media-viewer" id="chat-media-viewer" aria-label="Xem ảnh">
        <div class="chat-media-viewer-head">
          <strong id="chat-media-title"></strong>
          <label>Zoom <input type="range" id="chat-media-zoom" min="25" max="400" value="100" step="5"><output id="chat-media-zoom-output">100%</output></label>
          <button type="button" id="chat-media-reset">Vừa khung</button>
          <button type="button" id="chat-media-copy">Sao chép ảnh</button>
          <a id="chat-media-download" download>Tải ảnh</a>
          <button type="button" id="chat-media-close" aria-label="Đóng">×</button>
        </div>
        <div class="chat-media-viewer-scroll"><img id="chat-media-image" alt=""></div>
      </dialog>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(guestNotice);
    document.body.appendChild(windowEl);

    // Cache elements
    dom = {
      launcher,
      totalBadge: document.getElementById("chat-total-badge"),
      guestNotice,
      guestClose: document.getElementById("chat-guest-close"),
      guestLogin: document.getElementById("chat-guest-login"),
      window: windowEl,
      headerTitle: document.getElementById("chat-header-title"),
      statusDot: document.getElementById("chat-status-dot"),
      statusText: document.getElementById("chat-status-text"),
      backBtn: document.getElementById("chat-back-btn"),
      minimizeBtn: document.getElementById("chat-minimize-btn"),
      closeBtn: document.getElementById("chat-close-btn"),
      tabs: document.getElementById("chat-tabs"),
      tabGlobal: document.querySelector('.chat-tab[data-tab="global"]'),
      tabDirect: document.querySelector('.chat-tab[data-tab="direct"]'),
      tabGlobalBadge: document.getElementById("chat-tab-global-badge"),
      tabDirectBadge: document.getElementById("chat-tab-direct-badge"),
      paneGlobal: document.getElementById("chat-pane-global"),
      paneDirect: document.getElementById("chat-pane-direct"),
      globalMessages: document.getElementById("chat-global-messages"),
      globalTyping: document.getElementById("chat-global-typing"),
      globalTypingText: document.getElementById("chat-global-typing-text"),
      globalInput: document.getElementById("chat-global-input"),
      globalSend: document.getElementById("chat-global-send"),
      globalAttach: document.getElementById("chat-global-attach"),
      globalFile: document.getElementById("chat-global-file"),
      globalAttachmentPreview: document.getElementById("chat-global-attachment-preview"),
      dmListView: document.getElementById("chat-dm-list-view"),
      dmChatView: document.getElementById("chat-dm-chat-view"),
      userSearch: document.getElementById("chat-user-search"),
      conversationsList: document.getElementById("chat-conversations-list"),
      directMessages: document.getElementById("chat-direct-messages"),
      directTyping: document.getElementById("chat-direct-typing"),
      directTypingText: document.getElementById("chat-direct-typing-text"),
      directInput: document.getElementById("chat-direct-input"),
      directSend: document.getElementById("chat-direct-send"),
      mediaViewer: document.getElementById("chat-media-viewer"),
      mediaTitle: document.getElementById("chat-media-title"),
      mediaZoom: document.getElementById("chat-media-zoom"),
      mediaZoomOutput: document.getElementById("chat-media-zoom-output"),
      mediaImage: document.getElementById("chat-media-image"),
      mediaDownload: document.getElementById("chat-media-download"),
      mediaCopy: document.getElementById("chat-media-copy")
    };

    bindEvents();
  }

  // ----------------------------------------------------
  // Event Bindings
  // ----------------------------------------------------
  function bindEvents() {
    // Launcher click
    dom.launcher.addEventListener("click", () => {
      if (!currentUser) {
        dom.guestNotice.hidden = false;
        return;
      }
      toggleChatWindow();
    });

    // Guest notice buttons
    dom.guestClose.addEventListener("click", () => {
      dom.guestNotice.hidden = true;
    });
    dom.guestLogin.addEventListener("click", () => {
      dom.guestNotice.hidden = true;
      const loginBtn = document.getElementById("login-open");
      if (loginBtn) loginBtn.click();
    });

    // Window controls
    dom.minimizeBtn.addEventListener("click", closeChatWindow);
    dom.closeBtn.addEventListener("click", closeChatWindow);

    // Back button in 1-1 chat
    dom.backBtn.addEventListener("click", () => {
      activeDirectConv = null;
      dom.backBtn.hidden = true;
      dom.headerTitle.textContent = "Tin nhắn riêng";
      dom.dmChatView.hidden = true;
      dom.dmListView.hidden = false;
      dom.tabs.hidden = false;
      updateHeaderStatus();
      loadConversations();
    });

    // Tab switching
    dom.tabs.addEventListener("click", (e) => {
      const tabBtn = e.target.closest(".chat-tab");
      if (!tabBtn) return;
      const targetTab = tabBtn.dataset.tab;
      switchTab(targetTab);
    });

    // Send global message
    dom.globalSend.addEventListener("click", sendGlobalMessage);
    dom.globalInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendGlobalMessage();
      }
    });
    dom.globalInput.addEventListener("input", () => handleTyping("global"));
    dom.globalAttach.addEventListener("click", () => dom.globalFile.click());
    dom.globalFile.addEventListener("change", () => {
      const file = dom.globalFile.files?.[0];
      if (file) setPendingGlobalAttachment(file);
      dom.globalFile.value = "";
    });
    dom.globalInput.addEventListener("paste", event => {
      const file = Array.from(event.clipboardData?.files || []).find(item => item.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      setPendingGlobalAttachment(file);
    });
    dom.globalAttachmentPreview.addEventListener("click", event => {
      if (event.target.closest("[data-chat-clear-attachment]")) clearPendingGlobalAttachment();
    });

    dom.window.addEventListener("click", event => {
      const imageButton = event.target.closest("[data-chat-image]");
      if (imageButton) openMediaViewer(imageButton.dataset.chatImage, imageButton.dataset.chatImageName || "Ảnh");
    });
    document.getElementById("chat-media-close").addEventListener("click", () => dom.mediaViewer.close());
    document.getElementById("chat-media-reset").addEventListener("click", () => setMediaZoom(100));
    dom.mediaZoom.addEventListener("input", () => setMediaZoom(Number(dom.mediaZoom.value)));
    dom.mediaImage.parentElement.title = "Lăn chuột lên để phóng to, xuống để thu nhỏ";
    dom.mediaImage.parentElement.addEventListener("wheel", event => {
      if (!event.deltaY) return;
      event.preventDefault();
      setMediaZoom(Number(dom.mediaZoom.value) + (event.deltaY < 0 ? 10 : -10), { x: event.clientX, y: event.clientY });
    }, { passive: false });
    dom.mediaCopy.addEventListener("click", copyViewedImage);

    // Send direct message
    dom.directSend.addEventListener("click", sendDirectMessage);
    dom.directInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendDirectMessage();
      }
    });
    dom.directInput.addEventListener("input", () => {
      if (activeDirectConv) handleTyping(activeDirectConv.id);
    });

    // Search users in Direct Messages
    let searchDebounce = null;
    dom.userSearch.addEventListener("input", (e) => {
      clearTimeout(searchDebounce);
      const query = e.target.value.trim();
      searchDebounce = setTimeout(() => {
        searchUsers(query);
      }, 300);
    });
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function clearPendingGlobalAttachment() {
    if (pendingGlobalPreviewUrl) URL.revokeObjectURL(pendingGlobalPreviewUrl);
    pendingGlobalPreviewUrl = "";
    pendingGlobalAttachment = null;
    dom.globalAttachmentPreview.replaceChildren();
    dom.globalAttachmentPreview.hidden = true;
  }

  function setPendingGlobalAttachment(file) {
    if (!file || file.size > 10 * 1024 * 1024) {
      alert("Tệp đính kèm tối đa 10 MB.");
      return;
    }
    clearPendingGlobalAttachment();
    pendingGlobalAttachment = file;
    const card = el("div", "chat-attachment-preview-card");
    if (file.type.startsWith("image/")) {
      pendingGlobalPreviewUrl = URL.createObjectURL(file);
      const image = document.createElement("img");
      image.src = pendingGlobalPreviewUrl;
      image.alt = "Ảnh chuẩn bị gửi";
      card.append(image);
    } else {
      card.append(el("span", "chat-attachment-file-icon", "📎"));
    }
    const info = el("span", "chat-attachment-preview-info");
    info.append(el("strong", "", file.name || "Tệp đính kèm"), el("small", "", formatFileSize(file.size)));
    const remove = el("button", "chat-attachment-remove", "×");
    remove.type = "button";
    remove.dataset.chatClearAttachment = "";
    remove.setAttribute("aria-label", "Bỏ tệp đính kèm");
    card.append(info, remove);
    dom.globalAttachmentPreview.append(card);
    dom.globalAttachmentPreview.hidden = false;
  }

  function setMediaZoom(value, anchor) {
    const before = anchor && dom.mediaImage.getBoundingClientRect();
    const zoom = Math.min(400, Math.max(25, Number(value) || 100));
    dom.mediaZoom.value = String(zoom);
    dom.mediaZoomOutput.textContent = `${zoom}%`;
    dom.mediaImage.style.width = `${zoom}%`;
    dom.mediaZoom.setAttribute("aria-valuetext", `${zoom}%`);
    if (before?.width && before.height) {
      const after = dom.mediaImage.getBoundingClientRect();
      const viewport = dom.mediaImage.parentElement;
      viewport.scrollLeft += after.left + (anchor.x - before.left) / before.width * after.width - anchor.x;
      viewport.scrollTop += after.top + (anchor.y - before.top) / before.height * after.height - anchor.y;
    }
  }

  function openMediaViewer(src, name) {
    dom.mediaTitle.textContent = name;
    dom.mediaImage.src = src;
    dom.mediaImage.alt = name;
    dom.mediaDownload.href = src;
    dom.mediaDownload.download = name;
    setMediaZoom(100);
    dom.mediaViewer.showModal();
  }

  async function copyViewedImage() {
    try {
      const response = await fetch(dom.mediaImage.src, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Image unavailable");
      const sourceBlob = await response.blob();
      let copyBlob = sourceBlob;
      if (sourceBlob.type !== "image/png") {
        const bitmap = await createImageBitmap(sourceBlob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        bitmap.close();
        copyBlob = await new Promise((resolve, reject) => {
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image conversion failed")), "image/png");
        });
      }
      await navigator.clipboard.write([new ClipboardItem({ [copyBlob.type]: copyBlob })]);
      dom.mediaCopy.textContent = "Đã sao chép";
      setTimeout(() => { dom.mediaCopy.textContent = "Sao chép ảnh"; }, 1400);
    } catch {
      alert("Trình duyệt không cho phép sao chép ảnh này.");
    }
  }

  // ----------------------------------------------------
  // UI Navigation & View State Management
  // ----------------------------------------------------
  function toggleChatWindow() {
    isWindowOpen = !isWindowOpen;
    dom.window.hidden = !isWindowOpen;
    if (isWindowOpen) {
      dom.guestNotice.hidden = true;
      if (activeTab === "global") {
        dom.headerTitle.textContent = "Phòng học tập chung";
        dom.backBtn.hidden = true;
        if (!socket?.connected) loadGlobalMessages();
        markConversationRead("global");
        scrollMessagesToBottom(dom.globalMessages);
      } else if (activeDirectConv) {
        dom.headerTitle.textContent = activeDirectConv.partner.name;
        dom.backBtn.hidden = false;
        markConversationRead(activeDirectConv.id);
        scrollMessagesToBottom(dom.directMessages);
      } else {
        dom.headerTitle.textContent = "Tin nhắn riêng";
        dom.backBtn.hidden = true;
        loadConversations();
      }
      updateHeaderStatus();
    }
  }

  function closeChatWindow() {
    isWindowOpen = false;
    dom.window.hidden = true;
  }

  window.addEventListener("maihoc-close-chat", closeChatWindow);
  document.addEventListener("click", event => {
    if (
      isWindowOpen &&
      dom.window &&
      !dom.window.contains(event.target) &&
      !dom.launcher?.contains(event.target)
    ) {
      closeChatWindow();
    }
  });

  function schoolChatAvailable() { return document.body.hasAttribute('data-school-ui') && canAccessSchool(currentUser); }
  function syncChatSpace() {
    if (!dom.tabDirect) return;
    dom.tabDirect.hidden = false;
    if (!schoolChatAvailable()) switchTab('global');
  }
  window.addEventListener('maihoc-route-changed', syncChatSpace);
  function switchTab(tab) {
    if (tab === 'direct' && !schoolChatAvailable()) { window.location.assign('/school/plans'); return; }
    activeTab = tab;
    dom.tabGlobal.classList.toggle("active", tab === "global");
    dom.tabDirect.classList.toggle("active", tab === "direct");

    if (tab === "global") {
      dom.paneGlobal.hidden = false;
      dom.paneDirect.hidden = true;
      dom.backBtn.hidden = true;
      dom.headerTitle.textContent = "Phòng học tập chung";
      updateHeaderStatus();
      markConversationRead("global");
      scrollMessagesToBottom(dom.globalMessages);
    } else {
      dom.paneGlobal.hidden = true;
      dom.paneDirect.hidden = false;
      if (activeDirectConv) {
        dom.dmListView.hidden = true;
        dom.dmChatView.hidden = false;
        dom.backBtn.hidden = false;
        dom.headerTitle.textContent = activeDirectConv.partner.name;
        markConversationRead(activeDirectConv.id);
        scrollMessagesToBottom(dom.directMessages);
      } else {
        dom.dmListView.hidden = false;
        dom.dmChatView.hidden = true;
        dom.backBtn.hidden = true;
        dom.headerTitle.textContent = "Tin nhắn riêng";
        loadConversations();
      }
      updateHeaderStatus();
    }
  }

  function updateHeaderStatus() {
    if (!socket || !socket.connected) {
      dom.statusDot.className = "chat-status-dot offline";
      dom.statusText.textContent = "Mất kết nối";
      return;
    }

    if (activeTab === "global" || !activeDirectConv) {
      dom.statusDot.className = "chat-status-dot online";
      dom.statusText.textContent = "Đã kết nối";
    } else if (activeDirectConv) {
      const isOnline = Boolean(activeDirectConv.partner?.isOnline);
      dom.statusDot.className = `chat-status-dot ${isOnline ? "online" : "offline"}`;
      dom.statusText.textContent = isOnline ? "Đang trực tuyến" : "Ngoại tuyến";
    }
  }

  function updateBadgeUI() {
    // Tab badges
    dom.tabGlobalBadge.hidden = unreadCounts.global <= 0;
    dom.tabGlobalBadge.textContent = unreadCounts.global > 99 ? "99+" : unreadCounts.global;

    dom.tabDirectBadge.hidden = unreadCounts.directTotal <= 0;
    dom.tabDirectBadge.textContent = unreadCounts.directTotal > 99 ? "99+" : unreadCounts.directTotal;

    // Overall total badge on launcher
    const total = unreadCounts.global + unreadCounts.directTotal;
    dom.totalBadge.hidden = total <= 0;
    dom.totalBadge.textContent = total > 99 ? "99+" : total;
  }

  // ----------------------------------------------------
  // Messages Rendering
  // ----------------------------------------------------
  function renderMessageItem(msg, container) {
    if (Array.from(container.children).some(node => node.dataset.messageId === String(msg.id))) return;
    const created = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(msg.createdAt) ? msg.createdAt : msg.createdAt.replace(' ', 'T') + 'Z');
    if (created <= Date.now() - 86400000) return;
    const isMine = currentUser && Number(msg.senderId) === Number(currentUser.id);

    const group = el("div", `chat-message-group ${isMine ? "mine" : "other"}`);
    group.dataset.messageId = msg.id;
    group.dataset.expiresAt = created + 86400000;

    if (!isMine) {
      const senderEl = el("div", "chat-message-sender", msg.senderName || "Học sinh");
      group.appendChild(senderEl);
    }

    const bubble = el("div", "chat-bubble");
    if (msg.content) bubble.append(el("span", "chat-message-text", msg.content));
    if (msg.attachment) {
      const source = `/api/chat/messages/${encodeURIComponent(msg.id)}/attachment`;
      if (String(msg.attachment.type || "").startsWith("image/")) {
        const button = el("button", "chat-image-attachment");
        button.type = "button";
        button.dataset.chatImage = source;
        button.dataset.chatImageName = msg.attachment.name || "Ảnh";
        button.title = "Nhấn để xem và zoom ảnh";
        const image = document.createElement("img");
        image.src = source;
        image.alt = msg.attachment.name || "Ảnh được gửi trong phòng học tập chung";
        image.loading = "lazy";
        button.append(image);
        bubble.append(button);
      } else {
        const file = el("a", "chat-file-attachment");
        file.href = source;
        file.download = msg.attachment.name || "tep-dinh-kem";
        file.append(el("span", "chat-file-icon", "📎"));
        const details = el("span", "chat-file-details");
        details.append(el("strong", "", msg.attachment.name || "Tệp đính kèm"), el("small", "", formatFileSize(msg.attachment.size)));
        file.append(details);
        bubble.append(file);
      }
    }
    group.appendChild(bubble);

    const timeEl = el("div", "chat-message-time", formatChatTime(msg.createdAt));
    group.appendChild(timeEl);

    container.appendChild(group);
  }

  function scrollMessagesToBottom(container, force = false) {
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (force || isNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }

  // ----------------------------------------------------
  // Real-time Chat Operations
  // ----------------------------------------------------
  async function sendGlobalMessage() {
    const text = dom.globalInput.value.trim();
    if ((!text && !pendingGlobalAttachment) || dom.globalSend.disabled) return;
    if (!pendingGlobalAttachment && (!socket || !socket.connected)) return;

    dom.globalSend.disabled = true;
    if (pendingGlobalAttachment) {
      try {
        const form = new FormData();
        form.append("conversationId", "global");
        form.append("content", text);
        form.append("attachment", pendingGlobalAttachment, pendingGlobalAttachment.name);
        const response = await fetch("/api/chat/attachments", { method: "POST", body: form, credentials: "same-origin" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Không thể gửi tệp đính kèm.");
        if (result.message) {
          renderMessageItem(result.message, dom.globalMessages);
          scrollMessagesToBottom(dom.globalMessages, true);
        }
        dom.globalInput.value = "";
        clearPendingGlobalAttachment();
        dom.globalInput.focus();
      } catch (error) {
        alert(error.message);
      } finally {
        dom.globalSend.disabled = false;
      }
      return;
    }
    socket.emit("chat:send", {
      conversationId: "global",
      content: text
    }, (res) => {
      dom.globalSend.disabled = false;
      if (res && res.error) {
        alert(res.error);
        return;
      }
      dom.globalInput.value = "";
      dom.globalInput.focus();
    });
  }

  function sendDirectMessage() {
    if (!activeDirectConv) return;
    const text = dom.directInput.value.trim();
    if (!text || !socket || !socket.connected) return;

    dom.directSend.disabled = true;
    socket.emit("chat:send", {
      conversationId: activeDirectConv.id,
      content: text
    }, (res) => {
      dom.directSend.disabled = false;
      if (res && res.error) {
        alert(res.error);
        return;
      }
      dom.directInput.value = "";
      dom.directInput.focus();
    });
  }

  function handleTyping(conversationId) {
    if (!socket || !socket.connected || !conversationId) return;

    if (!isTyping) {
      isTyping = true;
      socket.emit("chat:typing", { conversationId, isTyping: true });
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      isTyping = false;
      socket.emit("chat:typing", { conversationId, isTyping: false });
    }, 1500);
  }

  async function markConversationRead(convId) {
    if (!convId || !currentUser) return;

    if (convId === "global") {
      unreadCounts.global = 0;
    } else {
      const conv = conversationsMap.get(convId);
      if (conv) {
        unreadCounts.directTotal = Math.max(0, unreadCounts.directTotal - (conv.unreadCount || 0));
        conv.unreadCount = 0;
      }
    }
    updateBadgeUI();

    try {
      await fetch(`/api/chat/conversations/${encodeURIComponent(convId)}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      console.warn("Read receipt error:", e);
    }
  }

  // ----------------------------------------------------
  // Conversations & Direct Messages API Calls
  // ----------------------------------------------------
  async function loadGlobalMessages() {
    try {
      const res = await fetch("/api/chat/conversations/global/messages?limit=50", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      dom.globalMessages.innerHTML = "";
      for (const msg of data.messages || []) {
        renderMessageItem(msg, dom.globalMessages);
      }
      scrollMessagesToBottom(dom.globalMessages, true);
    } catch (e) {
      console.error("Failed to load global chat:", e);
    }
  }

  async function loadConversations() {
    try {
      const res = await fetch("/api/chat/conversations", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.conversations || []).filter(c => c.type !== "direct" || c.partner);
      if (activeDirectConv && !list.some(c => c.id === activeDirectConv.id)) { activeDirectConv = null; dom.directMessages.innerHTML = ""; dom.dmListView.hidden = false; dom.dmChatView.hidden = true; dom.headerTitle.textContent = "Tin nhắn riêng"; dom.backBtn.hidden = true; }

      conversationsMap.clear();
      let directUnread = 0;

      for (const conv of list) {
        conversationsMap.set(conv.id, conv);
        if (conv.type === "global") {
          unreadCounts.global = conv.unreadCount || 0;
        } else if (conv.type === "direct") {
          directUnread += conv.unreadCount || 0;
        }
      }
      unreadCounts.directTotal = directUnread;
      updateBadgeUI();

      renderConversationsList();
    } catch (e) {
      console.error("Failed to load conversations:", e);
    }
  }

  function renderConversationsList() {
    const directConvs = Array.from(conversationsMap.values()).filter(c => c.type === "direct");
    dom.conversationsList.innerHTML = "";

    if (!directConvs.length) {
      dom.conversationsList.innerHTML = '<p class="chat-empty-hint">Chưa có cuộc trò chuyện nào.<br>Hãy tìm bạn học bên trên để bắt đầu nhắn tin!</p>';
      return;
    }

    for (const conv of directConvs) {
      const item = el("div", `chat-conv-item ${conv.unreadCount > 0 ? "has-unread" : ""}`);
      item.dataset.convId = conv.id;

      const partner = conv.partner || { name: "Bạn học", isOnline: false };
      const lastMsg = conv.lastMessage;

      // Avatar
      const avatar = el("div", "chat-avatar", getInitials(partner.name));
      const statusDot = el("span", `chat-avatar-status ${partner.isOnline ? "online" : "offline"}`);
      avatar.appendChild(statusDot);
      item.appendChild(avatar);

      // Info
      const info = el("div", "chat-conv-info");

      const top = el("div", "chat-conv-top");
      const nameEl = el("span", "chat-conv-name", partner.name);
      const timeEl = el("span", "chat-conv-time", lastMsg ? formatChatTime(lastMsg.createdAt) : "");
      top.appendChild(nameEl);
      top.appendChild(timeEl);
      info.appendChild(top);

      const bottom = el("div", "chat-conv-bottom");
      const previewText = lastMsg
        ? `${Number(lastMsg.senderId) === Number(currentUser.id) ? "Bạn: " : ""}${lastMsg.content || (lastMsg.attachment ? `📎 ${lastMsg.attachment.name}` : "Tin nhắn")}`
        : "Bắt đầu cuộc trò chuyện";
      const previewEl = el("p", "chat-conv-preview", previewText);
      bottom.appendChild(previewEl);

      if (conv.unreadCount > 0) {
        const badge = el("span", "chat-unread-badge", String(conv.unreadCount));
        bottom.appendChild(badge);
      }
      info.appendChild(bottom);

      item.appendChild(info);

      item.addEventListener("click", () => {
        openDirectChat(conv.id, partner);
      });

      dom.conversationsList.appendChild(item);
    }
  }

  async function searchUsers(query) {
    if (!query) {
      renderConversationsList();
      return;
    }

    try {
      const res = await fetch(`/api/chat/users?q=${encodeURIComponent(query)}`, {
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        dom.conversationsList.innerHTML = "";
        dom.conversationsList.appendChild(el("p", "chat-empty-hint", data.error || "Không thể tìm người dùng. Hãy đăng nhập lại rồi thử lại."));
        return;
      }
      const users = data.users || [];

      dom.conversationsList.innerHTML = "";

      const label = el("div", "chat-section-label", query
        ? `Kết quả tìm kiếm (${users.length})`
        : `Người dùng gần đây (${users.length})`);
      dom.conversationsList.appendChild(label);

      if (!users.length) {
        dom.conversationsList.appendChild(el("p", "chat-empty-hint", query
          ? "Không tìm thấy người dùng theo tên hoặc email."
          : "Chưa có người dùng phù hợp."));
        return;
      }

      for (const u of users) {
        const item = el("div", "chat-conv-item");
        const avatar = el("div", "chat-avatar", getInitials(u.name));
        const statusDot = el("span", `chat-avatar-status ${u.isOnline ? "online" : "offline"}`);
        avatar.appendChild(statusDot);
        item.appendChild(avatar);

        const info = el("div", "chat-conv-info");
        const nameEl = el("span", "chat-conv-name", u.name);
        const sub = el("p", "chat-conv-preview", u.isOnline ? "Đang hoạt động" : "Ngoại tuyến");
        info.appendChild(nameEl);
        info.appendChild(sub);
        item.appendChild(info);

        item.addEventListener("click", async () => {
          await startDirectChatWithUser(u.id);
        });

        dom.conversationsList.appendChild(item);
      }
    } catch (e) {
      console.error("Search users error:", e);
    }
  }

  async function startDirectChatWithUser(targetUserId) {
    try {
      const res = await fetch("/api/chat/direct", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ targetUserId: Number(targetUserId) })
      });
      const conv = await res.json().catch(() => ({}));
      if (!res.ok) {
        dom.conversationsList.innerHTML = "";
        dom.conversationsList.appendChild(el("p", "chat-empty-hint", conv.error || "Không thể mở cuộc trò chuyện. Hãy đăng nhập lại rồi thử."));
        return;
      }
      await openDirectChat(conv.id, conv.partner);
    } catch (e) {
      console.error("Start direct chat error:", e);
      dom.conversationsList.innerHTML = "";
      dom.conversationsList.appendChild(el("p", "chat-empty-hint", "Không kết nối được máy chủ chat. Vui lòng thử lại."));
    }
  }

  async function openDirectChat(convId, partner) {
    activeDirectConv = { id: convId, partner };
    dom.userSearch.value = "";

    // Join room via socket
    if (socket && socket.connected) {
      socket.emit("chat:join", convId);
    }

    // Switch view
    dom.dmListView.hidden = true;
    dom.dmChatView.hidden = false;
    dom.backBtn.hidden = false;
    dom.headerTitle.textContent = partner.name;
    updateHeaderStatus();

    // Load messages
    dom.directMessages.innerHTML = '<p class="chat-empty-hint">Đang tải tin nhắn...</p>';
    try {
      const res = await fetch(`/api/chat/conversations/${encodeURIComponent(convId)}/messages?limit=50`, { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        dom.directMessages.innerHTML = "";
        for (const msg of data.messages || []) {
          renderMessageItem(msg, dom.directMessages);
        }
        scrollMessagesToBottom(dom.directMessages, true);
        markConversationRead(convId);
      }
    } catch (e) {
      dom.directMessages.innerHTML = '<p class="chat-empty-hint">Lỗi tải tin nhắn.</p>';
    }
  }

  // ----------------------------------------------------
  // Socket.IO Connection & Event Handlers
  // ----------------------------------------------------
  function initSocket() {
    if (!window.io) {
      console.warn("Socket.IO client library not loaded yet.");
      return;
    }
    if (socket) {
      socket.disconnect();
    }

    socket = window.io({
      path: "/socket.io",
      withCredentials: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });

    socket.on("connect", () => {
      updateHeaderStatus();
      loadConversations();
      loadGlobalMessages();
      if (activeDirectConv) {
        socket.emit("chat:join", activeDirectConv.id);
      }
    });

    socket.on("disconnect", () => {
      updateHeaderStatus();
    });

    socket.on("connect_error", (err) => {
      updateHeaderStatus();
      console.warn("Socket connect error:", err.message);
    });

    // Handle new incoming messages
    socket.on("chat:new-message", (msg) => {
      const isCurrentGlobal = activeTab === "global" && msg.conversationId === "global" && isWindowOpen;
      const isCurrentDirect = activeTab === "direct" && activeDirectConv && msg.conversationId === activeDirectConv.id && isWindowOpen;

      if (msg.conversationId === "global") {
        renderMessageItem(msg, dom.globalMessages);
        scrollMessagesToBottom(dom.globalMessages);
        if (isCurrentGlobal) {
          markConversationRead("global");
        } else {
          unreadCounts.global += 1;
          updateBadgeUI();
        }
      } else if (activeDirectConv && msg.conversationId === activeDirectConv.id) {
        renderMessageItem(msg, dom.directMessages);
        scrollMessagesToBottom(dom.directMessages);
        if (isCurrentDirect) {
          markConversationRead(msg.conversationId);
        } else {
          unreadCounts.directTotal += 1;
          updateBadgeUI();
        }
      } else {
        // Direct message from someone else
        unreadCounts.directTotal += 1;
        updateBadgeUI();
      }

      // Update conversations list preview
      loadConversations();
    });

    // Update conversation item on incoming direct message
    socket.on("chat:account-deleted", () => { loadConversations(); loadGlobalMessages(); });
    socket.on("chat:conversation-updated", () => {
      loadConversations();
    });

    // Presence updates
    socket.on("chat:presence", ({ userId, isOnline }) => {
      // Update partner status if chatting
      if (activeDirectConv && Number(activeDirectConv.partner.id) === Number(userId)) {
        activeDirectConv.partner.isOnline = isOnline;
        updateHeaderStatus();
      }

      // Update in conversations list
      const convs = Array.from(conversationsMap.values());
      for (const conv of convs) {
        if (conv.partner && Number(conv.partner.id) === Number(userId)) {
          conv.partner.isOnline = isOnline;
        }
      }
      renderConversationsList();
    });

    // Typing indicators
    socket.on("chat:user-typing", ({ conversationId, userName, isTyping: typingStatus }) => {
      if (conversationId === "global" && activeTab === "global") {
        dom.globalTyping.hidden = !typingStatus;
        if (typingStatus) dom.globalTypingText.textContent = `${userName} đang soạn tin...`;
      } else if (activeDirectConv && conversationId === activeDirectConv.id && activeTab === "direct") {
        dom.directTyping.hidden = !typingStatus;
        if (typingStatus) dom.directTypingText.textContent = `${userName} đang soạn tin...`;
      }
    });
  }

  // Open a direct chat from the online-users dashboard.
  window.addEventListener("maihoc-open-direct-chat", async (event) => {
    const targetUserId = Number(event.detail?.userId);
    if (!targetUserId) return;
    if (!currentUser) {
      dom.guestNotice.hidden = false;
      return;
    }
    isWindowOpen = true;
    dom.window.hidden = false;
    dom.guestNotice.hidden = true;
    switchTab("direct");
    await startDirectChatWithUser(targetUserId);
  });

  // ----------------------------------------------------
  // Auth State Listener
  // ----------------------------------------------------
  async function checkAuthAndInit() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      const data = await res.json();
      currentUser = data.user || null;

      if (currentUser) {
        initSocket();
        dom.launcher.hidden = false;
      } else {
        clearPendingGlobalAttachment();
        if (dom.mediaViewer?.open) dom.mediaViewer.close();
        if (socket) {
          socket.disconnect();
          socket = null;
        }
        closeChatWindow();
        dom.totalBadge.hidden = true;
        unreadCounts = { global: 0, directTotal: 0 };
        updateBadgeUI();
      }
    } catch {
      currentUser = null;
      clearPendingGlobalAttachment();
    }
  }

  // Initialize once DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    buildWidget();
    checkAuthAndInit();
    syncChatSpace();
  });

  // Re-check auth whenever user logs in or out in MAI HỌC
  window.addEventListener("maihoc-auth-changed", () => {
    checkAuthAndInit();
    syncChatSpace();
  });
})();

