// clientLogger: capture console logs and errors and send them to backend in batches
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL = 5000; // ms
const STORAGE_KEY = 'clientLogger:pending';

function nowIso() {
  return new Date().toISOString();
}

function safeSerialize(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    try {
      return String(obj);
    } catch (e2) {
      return '[unserializable]';
    }
  }
}

const _VITE_BACKEND = import.meta.env.VITE_BACKEND_URL || '';
const _BACKEND_PREFIX = (_VITE_BACKEND || '').replace(/\/$/, '');

function sendPayload(payload) {
  try {
    // Use fetch; no CORS if using proxy in dev. Use sendBeacon on unload.
    const url = `${_BACKEND_PREFIX}/api/db/client-logs`;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (e) {
    return Promise.reject(e);
  }
}

const clientLogger = {
  _buffer: [],
  _orig: {},
  _options: {},

  init(options = {}) {
    this._options = Object.assign({ batchSize: DEFAULT_BATCH_SIZE, flushInterval: DEFAULT_FLUSH_INTERVAL, source: 'client' }, options);
    // restore pending from localStorage
    try {
      const pending = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(pending) && pending.length) this._buffer.push(...pending);
    } catch (e) {}

    // wrap console methods
    ['log', 'info', 'warn', 'error', 'debug'].forEach((m) => {
      this._orig[m] = console[m];
      console[m] = (...args) => {
        try { this._capture(m, args); } catch (e) {}
        this._orig[m].apply(console, args);
      };
    });

    // window errors
    window.addEventListener('error', (ev) => {
      try {
        const { message, filename, lineno, colno, error } = ev;
        this._capture('error', [message, { filename, lineno, colno, stack: error && error.stack }]);
      } catch (e) {}
    });

    window.addEventListener('unhandledrejection', (ev) => {
      try {
        const reason = ev.reason;
        this._capture('error', ['UnhandledRejection', { reason: safeSerialize(reason) }]);
      } catch (e) {}
    });

    // flush periodically
    this._interval = setInterval(() => this.flush(), this._options.flushInterval);

    // flush on page hide/unload using sendBeacon where possible
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this._flushSync();
    });
    window.addEventListener('beforeunload', () => this._flushSync());
  },

  _capture(level, args) {
    const entry = { ts: nowIso(), level, payload: args.map(a => (typeof a === 'string' ? a : safeSerialize(a))), source: this._options.source };
    this._buffer.push(entry);
    // persist to localStorage as backup
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._buffer.slice(0, 1000))); } catch (e) {}
    if (this._buffer.length >= this._options.batchSize) this.flush();
  },

  flush() {
    if (!this._buffer.length) return Promise.resolve();
    const toSend = this._buffer.splice(0, this._options.batchSize);
    // update localStorage
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._buffer.slice(0, 1000))); } catch (e) {}
    const payload = { source: this._options.source, ts: nowIso(), logs: toSend };
    return sendPayload(payload).then((res) => {
      if (!res.ok) {
        // requeue
        this._buffer.unshift(...toSend);
      }
    }).catch(() => {
      // network error, requeue
      this._buffer.unshift(...toSend);
    });
  },

  _flushSync() {
    if (!this._buffer.length) return;
    const payload = { source: this._options.source, ts: nowIso(), logs: this._buffer.splice(0) };
    try {
      const body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        const url = `${_BACKEND_PREFIX}/api/db/client-logs`;
        const ok = navigator.sendBeacon(url, body);
        if (!ok) {
          // fallback to synchronous XHR
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url, false);
          xhr.setRequestHeader('Content-Type', 'application/json');
          try { xhr.send(body); } catch (e) {}
        }
      } else {
        const url = `${_BACKEND_PREFIX}/api/db/client-logs`;
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        try { xhr.send(body); } catch (e) {}
      }
    } catch (e) {}
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }
};

export default clientLogger;
