// figma-agent-plugin/protocol-envelope.js
//
// Plugin-sandbox mirror of `protocol/envelope.mjs`. Build unit p5-1.
//
// The Figma plugin sandbox cannot `require`/`import` from outside its own
// bundle, so this is a self-contained file: pure-JS SHA-256 + HMAC + UUID.
// It produces byte-equivalent HMAC hex output for identical inputs to the
// Node-side implementation so signed envelopes verify cleanly across the
// wire. No external dependencies, no Figma API surface used.
//
// Schema decisions (mirrors Node side):
//   - Clock-skew tolerance: ±60s on either side of now.
//   - Hard expiry:           5 minutes (300_000 ms) past `timestamp`.
//   - Replay-protection set: in-memory Map, FIFO-evicted at 1000 entries.
//
// Globals exposed (the plugin sandbox runs files as concatenated scripts;
// `var` at top level lands on globalThis):
//   var ProtocolEnvelope = { createEnvelope, verifyEnvelope, stableStringify,
//                            CLOCK_SKEW_MS, MAX_AGE_MS, REPLAY_SET_LIMIT,
//                            _resetReplaySet, _replaySetSize };

var ProtocolEnvelope = (function () {
  'use strict';

  var CLOCK_SKEW_MS = 60000;       // ±60s tolerance
  var MAX_AGE_MS = 5 * 60000;      // 5 min hard expiry
  var REPLAY_SET_LIMIT = 1000;     // FIFO eviction beyond this

  // ── stable serialization ─────────────────────────────────────────────────

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      var arr = [];
      for (var i = 0; i < value.length; i++) {
        arr.push(stableStringify(value[i]));
      }
      return '[' + arr.join(',') + ']';
    }
    var keys = Object.keys(value).sort();
    var parts = [];
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var v = value[key];
      if (typeof v === 'undefined') continue;
      parts.push(JSON.stringify(key) + ':' + stableStringify(v));
    }
    return '{' + parts.join(',') + '}';
  }

  // ── UUID v4 (collision-resistant; not cryptographically random — fine
  //   because uniqueness for the replay-protection set is the only need;
  //   secrecy is provided by HMAC). ───────────────────────────────────────

  function uuidV4() {
    // RFC 4122 v4 layout: 8-4-4-4-12 hex chars, with version + variant bits.
    var hex = '0123456789abcdef';
    var s = '';
    for (var i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        s += '-';
        continue;
      }
      if (i === 14) {
        s += '4';
        continue;
      }
      var r = (Math.random() * 16) | 0;
      if (i === 19) {
        s += hex.charAt((r & 0x3) | 0x8);
        continue;
      }
      s += hex.charAt(r);
    }
    return s;
  }

  // ── pure-JS SHA-256 ──────────────────────────────────────────────────────
  // Reference: FIPS 180-4. Tested against Node's crypto.createHash('sha256')
  // for ASCII + UTF-8 inputs. Operates on 32-bit unsigned words via `>>> 0`.

  var SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  function rotr(x, n) {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
  }

  function utf8Bytes(str) {
    // Encodes a JS string to a Uint8Array of UTF-8 bytes without depending
    // on TextEncoder (older sandboxes may lack it). Standard surrogate-pair
    // handling.
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        bytes.push(c);
      } else if (c < 0x800) {
        bytes.push(0xc0 | (c >> 6));
        bytes.push(0x80 | (c & 0x3f));
      } else if (c < 0xd800 || c >= 0xe000) {
        bytes.push(0xe0 | (c >> 12));
        bytes.push(0x80 | ((c >> 6) & 0x3f));
        bytes.push(0x80 | (c & 0x3f));
      } else {
        // surrogate pair
        i++;
        var c2 = str.charCodeAt(i);
        var cp = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
        bytes.push(0xf0 | (cp >> 18));
        bytes.push(0x80 | ((cp >> 12) & 0x3f));
        bytes.push(0x80 | ((cp >> 6) & 0x3f));
        bytes.push(0x80 | (cp & 0x3f));
      }
    }
    return new Uint8Array(bytes);
  }

  function sha256Bytes(bytes) {
    // Padding: 1 bit + zeros + 64-bit big-endian length
    var L = bytes.length;
    var bitLen = L * 8;
    var withPad = ((L + 9 + 63) >> 6) << 6; // round up to multiple of 64
    var msg = new Uint8Array(withPad);
    msg.set(bytes);
    msg[L] = 0x80;
    // Length goes into the LAST 8 bytes, big-endian. JS bit ops are 32-bit;
    // bitLen fits comfortably in 32 bits for any realistic envelope, so the
    // high 32 bits are zero.
    msg[withPad - 4] = (bitLen >>> 24) & 0xff;
    msg[withPad - 3] = (bitLen >>> 16) & 0xff;
    msg[withPad - 2] = (bitLen >>> 8) & 0xff;
    msg[withPad - 1] = bitLen & 0xff;

    var H = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    var W = new Uint32Array(64);

    for (var off = 0; off < msg.length; off += 64) {
      for (var t = 0; t < 16; t++) {
        var i = off + t * 4;
        W[t] = ((msg[i] << 24) | (msg[i + 1] << 16) | (msg[i + 2] << 8) | msg[i + 3]) >>> 0;
      }
      for (var t2 = 16; t2 < 64; t2++) {
        var s0 = rotr(W[t2 - 15], 7) ^ rotr(W[t2 - 15], 18) ^ (W[t2 - 15] >>> 3);
        var s1 = rotr(W[t2 - 2], 17) ^ rotr(W[t2 - 2], 19) ^ (W[t2 - 2] >>> 10);
        W[t2] = (W[t2 - 16] + s0 + W[t2 - 7] + s1) >>> 0;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3];
      var e = H[4], f = H[5], g = H[6], h = H[7];

      for (var t3 = 0; t3 < 64; t3++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + SHA256_K[t3] + W[t3]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + mj) >>> 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }

      H[0] = (H[0] + a) >>> 0;
      H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0;
      H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0;
      H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0;
      H[7] = (H[7] + h) >>> 0;
    }

    var out = new Uint8Array(32);
    for (var k = 0; k < 8; k++) {
      out[k * 4] = (H[k] >>> 24) & 0xff;
      out[k * 4 + 1] = (H[k] >>> 16) & 0xff;
      out[k * 4 + 2] = (H[k] >>> 8) & 0xff;
      out[k * 4 + 3] = H[k] & 0xff;
    }
    return out;
  }

  function bytesToHex(bytes) {
    var hex = '0123456789abcdef';
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      s += hex.charAt((bytes[i] >>> 4) & 0xf) + hex.charAt(bytes[i] & 0xf);
    }
    return s;
  }

  function hmacSha256Hex(secret, message) {
    var keyBytes = utf8Bytes(String(secret));
    if (keyBytes.length > 64) {
      keyBytes = sha256Bytes(keyBytes);
    }
    var keyPadded = new Uint8Array(64);
    keyPadded.set(keyBytes);

    var oKeyPad = new Uint8Array(64);
    var iKeyPad = new Uint8Array(64);
    for (var i = 0; i < 64; i++) {
      oKeyPad[i] = keyPadded[i] ^ 0x5c;
      iKeyPad[i] = keyPadded[i] ^ 0x36;
    }

    var msgBytes = utf8Bytes(String(message));
    var inner = new Uint8Array(64 + msgBytes.length);
    inner.set(iKeyPad, 0);
    inner.set(msgBytes, 64);
    var innerHash = sha256Bytes(inner);

    var outer = new Uint8Array(64 + 32);
    outer.set(oKeyPad, 0);
    outer.set(innerHash, 64);
    var outerHash = sha256Bytes(outer);

    return bytesToHex(outerHash);
  }

  // ── envelope helpers (mirror protocol/envelope.mjs) ─────────────────────

  function preimageOf(envelope) {
    return stableStringify({
      id: envelope.id,
      payload: envelope.payload,
      timestamp: envelope.timestamp,
      type: envelope.type,
    });
  }

  function constantTimeEq(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  // ── replay-protection set ───────────────────────────────────────────────

  var _seenIds = new Map();

  function recordSeen(id) {
    if (_seenIds.has(id)) return;
    _seenIds.set(id, Date.now());
    while (_seenIds.size > REPLAY_SET_LIMIT) {
      var firstKey = _seenIds.keys().next().value;
      _seenIds.delete(firstKey);
    }
  }

  function _resetReplaySet() {
    _seenIds.clear();
  }

  function _replaySetSize() {
    return _seenIds.size;
  }

  // ── public API ──────────────────────────────────────────────────────────

  function createEnvelope(type, payload, secret) {
    if (typeof type !== 'string' || type.length === 0) {
      throw new TypeError('createEnvelope: type must be a non-empty string');
    }
    if (payload === null || typeof payload !== 'object') {
      throw new TypeError('createEnvelope: payload must be an object');
    }
    if (typeof secret !== 'string' || secret.length === 0) {
      throw new TypeError('createEnvelope: secret must be a non-empty string');
    }
    var envelope = {
      id: uuidV4(),
      type: type,
      payload: payload,
      timestamp: Date.now(),
    };
    envelope.hmac = hmacSha256Hex(secret, preimageOf(envelope));
    return envelope;
  }

  function verifyEnvelope(envelope, secret, options) {
    options = options || {};
    if (envelope === null || typeof envelope !== 'object') {
      return { ok: false, code: 'MALFORMED', message: 'envelope is not an object' };
    }
    var id = envelope.id;
    var type = envelope.type;
    var payload = envelope.payload;
    var timestamp = envelope.timestamp;
    var hmac = envelope.hmac;

    if (typeof id !== 'string' || id.length === 0) {
      return { ok: false, code: 'MALFORMED', message: 'missing id' };
    }
    if (typeof type !== 'string' || type.length === 0) {
      return { ok: false, code: 'MALFORMED', message: 'missing type' };
    }
    if (payload === null || typeof payload !== 'object') {
      return { ok: false, code: 'MALFORMED', message: 'missing or invalid payload' };
    }
    if (typeof timestamp !== 'number' || !isFinite(timestamp)) {
      return { ok: false, code: 'MALFORMED', message: 'missing or invalid timestamp' };
    }
    if (typeof hmac !== 'string' || hmac.length === 0) {
      return { ok: false, code: 'MALFORMED', message: 'missing hmac' };
    }
    if (typeof secret !== 'string' || secret.length === 0) {
      return { ok: false, code: 'MALFORMED', message: 'verifier secret must be non-empty string' };
    }

    var now = typeof options.now === 'number' ? options.now : Date.now();

    if (timestamp - now > CLOCK_SKEW_MS) {
      return { ok: false, code: 'EXPIRED', message: 'timestamp is in the future beyond clock-skew tolerance' };
    }
    if (now - timestamp > MAX_AGE_MS) {
      return { ok: false, code: 'EXPIRED', message: 'envelope older than max-age' };
    }

    var expected = hmacSha256Hex(secret, preimageOf(envelope));
    if (!constantTimeEq(expected, hmac)) {
      return { ok: false, code: 'HMAC_MISMATCH', message: 'hmac signature does not match' };
    }

    if (_seenIds.has(id)) {
      return { ok: false, code: 'REPLAY', message: 'envelope id already seen' };
    }
    recordSeen(id);

    return { ok: true };
  }

  return {
    createEnvelope: createEnvelope,
    verifyEnvelope: verifyEnvelope,
    stableStringify: stableStringify,
    CLOCK_SKEW_MS: CLOCK_SKEW_MS,
    MAX_AGE_MS: MAX_AGE_MS,
    REPLAY_SET_LIMIT: REPLAY_SET_LIMIT,
    _resetReplaySet: _resetReplaySet,
    _replaySetSize: _replaySetSize,
  };
})();

// Sanity export for non-Figma consumers (e.g. ad-hoc test scripts under
// Node) — Figma's plugin sandbox simply ignores the `module` reference.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProtocolEnvelope;
}
