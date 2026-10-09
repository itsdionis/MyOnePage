// End-to-end encryption of a shared page. The key lives only in the note and in the link after "#k=",
// which browsers never send to a server, so the server stores and serves ciphertext it cannot read.
// A classic script with no DOM: the browser, the Obsidian plugin and Node tests all load it as is.
//   envelope: "v1.<iv>.<ciphertext>", base64url, AES-256-GCM; the page address "<acct>/<id>" is the
//   additional data, so the server cannot serve one page's ciphertext as another's.
/** @param {Window} root */
(function (root) {
  const KEY = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url
  const ENVELOPE = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;
  const enc = new TextEncoder(),
    dec = new TextDecoder();

  /** @param {Uint8Array} bytes */
  const b64 = (bytes) => {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  /** @param {string} s */
  const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  /** @param {string} key @param {KeyUsage} use */
  const aesKey = (key, use) => {
    if (!KEY.test(key)) throw new Error('bad key');
    return crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, [use]);
  };

  function newKey() {
    return b64(crypto.getRandomValues(new Uint8Array(32)));
  }

  /** @param {string} key @param {string} address @param {string} text */
  async function seal(key, address, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode(address) },
      await aesKey(key, 'encrypt'),
      enc.encode(text),
    );
    return `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
  }

  // Throws when the key or the address does not match: a wrong or outdated link.
  /** @param {string} key @param {string} address @param {string} envelope */
  async function open(key, address, envelope) {
    if (!ENVELOPE.test(envelope)) throw new Error('not an encrypted page');
    const [, iv, ct] = envelope.split('.');
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode(address) },
      await aesKey(key, 'decrypt'),
      unb64(ct),
    );
    return dec.decode(pt);
  }

  root.SEAL = { KEY, ENVELOPE, newKey, seal, open };
})(window);
