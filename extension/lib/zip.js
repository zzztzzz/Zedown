/* zip.js — minimal, self-contained ZIP writer (stored / no compression).
   Produces a valid .zip Blob with correct local file headers, CRC32 and a
   central directory. UTF-8 filenames (general-purpose bit 11 set). No deflate,
   no dependencies. Classic script: attaches globalThis.makeZip so both window
   pages and the service worker can use it.

   API:
     makeZip(files) -> Blob   ('application/zip')
       files: [{ name: string (may contain '/'), data: string | Uint8Array }]
*/
(function () {
  'use strict';

  // ── CRC32 (IEEE 802.3 polynomial 0xEDB88320), table-driven ──────
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ── UTF-8 encoding ──────────────────────────────────────────────
  var ENC = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null;
  function utf8(str) {
    if (ENC) return ENC.encode(str);
    // Fallback manual UTF-8 (TextEncoder is universally available in MV3, but
    // keep this defensive path so the lib is fully self-contained).
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
      } else if (code >= 0xD800 && code <= 0xDBFF) {
        var hi = code, lo = str.charCodeAt(++i);
        var cp = 0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F),
                 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
      } else {
        out.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      }
    }
    return new Uint8Array(out);
  }

  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return utf8(String(data == null ? '' : data));
  }

  // ── little-endian writers into a plain array of bytes ───────────
  function pushU16(arr, v) {
    arr.push(v & 0xFF, (v >>> 8) & 0xFF);
  }
  function pushU32(arr, v) {
    arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
  }
  function pushBytes(arr, bytes) {
    for (var i = 0; i < bytes.length; i++) arr.push(bytes[i]);
  }

  // DOS time/date — fixed (no Date.now): 1980-01-01 00:00:00.
  var DOS_TIME = 0;
  var DOS_DATE = 0x21; // (1980-1980)<<9 | 1<<5 | 1

  function makeZip(files) {
    files = files || [];
    var local = [];          // accumulated local file records + data
    var central = [];        // central directory records
    var offset = 0;          // running offset of next local header
    var GP_FLAG = 0x0800;    // bit 11: filename is UTF-8

    for (var f = 0; f < files.length; f++) {
      var name = String(files[f].name || '');
      var nameBytes = utf8(name);
      var dataBytes = toBytes(files[f].data);
      var crc = crc32(dataBytes);
      var size = dataBytes.length;

      // ── local file header ──
      pushU32(local, 0x04034b50);   // signature
      pushU16(local, 20);           // version needed
      pushU16(local, GP_FLAG);      // general purpose flag (UTF-8)
      pushU16(local, 0);            // compression method: 0 = stored
      pushU16(local, DOS_TIME);     // mod time
      pushU16(local, DOS_DATE);     // mod date
      pushU32(local, crc);          // CRC32
      pushU32(local, size);         // compressed size
      pushU32(local, size);         // uncompressed size
      pushU16(local, nameBytes.length); // file name length
      pushU16(local, 0);            // extra field length
      pushBytes(local, nameBytes);  // file name
      pushBytes(local, dataBytes);  // file data

      // ── central directory header ──
      pushU32(central, 0x02014b50); // signature
      pushU16(central, 20);         // version made by
      pushU16(central, 20);         // version needed
      pushU16(central, GP_FLAG);    // general purpose flag (UTF-8)
      pushU16(central, 0);          // compression method
      pushU16(central, DOS_TIME);   // mod time
      pushU16(central, DOS_DATE);   // mod date
      pushU32(central, crc);        // CRC32
      pushU32(central, size);       // compressed size
      pushU32(central, size);       // uncompressed size
      pushU16(central, nameBytes.length); // file name length
      pushU16(central, 0);          // extra field length
      pushU16(central, 0);          // file comment length
      pushU16(central, 0);          // disk number start
      pushU16(central, 0);          // internal attributes
      pushU32(central, 0);          // external attributes
      pushU32(central, offset);     // relative offset of local header
      pushBytes(central, nameBytes); // file name

      // local header is 30 fixed bytes + name + data
      offset += 30 + nameBytes.length + size;
    }

    var centralOffset = offset;
    var centralSize = central.length;

    // ── end of central directory record ──
    var end = [];
    pushU32(end, 0x06054b50);       // signature
    pushU16(end, 0);                // disk number
    pushU16(end, 0);                // disk with central dir
    pushU16(end, files.length);     // entries on this disk
    pushU16(end, files.length);     // total entries
    pushU32(end, centralSize);      // central dir size
    pushU32(end, centralOffset);    // central dir offset
    pushU16(end, 0);                // comment length

    var blob = new Blob(
      [new Uint8Array(local), new Uint8Array(central), new Uint8Array(end)],
      { type: 'application/zip' }
    );
    return blob;
  }

  // Exposed for verification/testing.
  makeZip.crc32 = crc32;

  globalThis.makeZip = makeZip;
})();
