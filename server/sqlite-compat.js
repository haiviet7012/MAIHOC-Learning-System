import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

export default class CompatDatabase {
  constructor(filePath, options = {}) {
    if (options.fileMustExist && filePath !== ":memory:" && !fs.existsSync(filePath)) {
      throw new Error(`Cannot open database because the file does not exist: ${filePath}`);
    }
    this._db = new DatabaseSync(filePath === ":memory:" ? ":memory:" : filePath, {
      readOnly: Boolean(options.readonly)
    });
  }

  exec(sql) {
    return this._db.exec(sql);
  }

  prepare(sql) {
    const stmt = this._db.prepare(sql);
    return {
      run: (...args) => {
        const res = stmt.run(...args);
        return {
          changes: res.changes,
          lastInsertRowid: res.lastInsertRowid
        };
      },
      all: (...args) => stmt.all(...args),
      get: (...args) => stmt.get(...args)
    };
  }

  pragma(pragmaStr) {
    const trimmed = String(pragmaStr || "").trim();
    if (trimmed.includes("=")) {
      this._db.exec(`PRAGMA ${trimmed}`);
      return [];
    }
    try {
      return this._db.prepare(`PRAGMA ${trimmed}`).all();
    } catch {
      return [];
    }
  }

  transaction(fn) {
    return (...args) => {
      this._db.exec("BEGIN");
      try {
        const result = fn(...args);
        this._db.exec("COMMIT");
        return result;
      } catch (err) {
        try {
          this._db.exec("ROLLBACK");
        } catch {}
        throw err;
      }
    };
  }

  close() {
    try {
      this._db.close();
    } catch {}
  }
}

