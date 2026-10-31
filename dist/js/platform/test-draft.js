import { api } from "./api.js";
export class TestDraft {
  constructor(userId, testId) {
    this.key = `maihoc:test:${userId}:${testId}`;
    this.testId = testId;
    this.version = 0;
    this.session = null;
    this.saving = false;
    this.dirty = false;
    this.answers = {};
    this.destroyed = false;
  }
  async start() {
    try {
      const data = await api(
        `/api/tests/${encodeURIComponent(this.testId)}/session`,
        { method: "POST", body: {} },
      );
      this.session = data.session;
      this.version = this.session.version;
      this.answers = this.session.answers || {};
    } catch (error) {
      if (error.status !== 503) throw error;
      this.disabled = true;
    }
    try {
      const draft = JSON.parse(localStorage.getItem(this.key) || "null");
      if (draft && (!this.session || draft.version === this.version)) {
        this.answers = draft.answers || this.answers;
        this.dirty = true;
      }
    } catch {}
    return this;
  }
  update(answers) {
    this.answers = { ...answers };
    this.dirty = true;
    try {
      localStorage.setItem(
        this.key,
        JSON.stringify({ version: this.version, answers: this.answers }),
      );
      this.status("Đã lưu trên máy · chờ đồng bộ.");
    } catch {
      this.status("Đang chờ đồng bộ máy chủ.");
    }
  }
  status(message) {
    const target = document.querySelector("[data-test-save-status]");
    if (target) target.textContent = message;
  }
  async save() {
    if (this.saving || !this.dirty || this.disabled || this.destroyed) return;
    this.saving = true;
    this.dirty = false;
    const answers = { ...this.answers };
    try {
      const result = await api(
        `/api/tests/${encodeURIComponent(this.testId)}/session`,
        { method: "PATCH", body: { answers, version: this.version } },
      );
      this.version = result.version;
      try {
        localStorage.setItem(
          this.key,
          JSON.stringify({ version: this.version, answers: this.answers }),
        );
      } catch {}
      this.status("Đã đồng bộ với máy chủ.");
    } catch (error) {
      this.dirty = true;
      this.status(`Chưa đồng bộ: ${error.message}`);
    } finally {
      this.saving = false;
    }
  }
  clear() {
    try {
      localStorage.removeItem(this.key);
    } catch {}
    this.destroyed = true;
  }
}
