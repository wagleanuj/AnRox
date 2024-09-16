class EncryptionService {
  private encryptionKey: CryptoKey | null = null;

  async generateKeyPair() {
    return await window.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );
  }

  async exportPublicKey(publicKey: CryptoKey) {
    return await window.crypto.subtle.exportKey("jwk", publicKey);
  }

  async deriveSharedSecret(privateKey: CryptoKey, peerPublicKeyJwk: JsonWebKey) {
    const peerPublicKey = await window.crypto.subtle.importKey(
      "jwk", peerPublicKeyJwk, { name: "ECDH", namedCurve: "P-256" }, true, []
    );

    const sharedSecret = await window.crypto.subtle.deriveBits(
      { name: "ECDH", public: peerPublicKey }, privateKey, 256
    );

    this.encryptionKey = await window.crypto.subtle.importKey(
      "raw", sharedSecret, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }

  async encryptMessage(message: string): Promise<string> {
    if (!this.encryptionKey) throw new Error("Encryption key not set");

    const encodedMessage = new TextEncoder().encode(message);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv }, this.encryptionKey, encodedMessage
    );

    const result = new Uint8Array(iv.length + encryptedData.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encryptedData), iv.length);

    return btoa(String.fromCharCode.apply(null, result as unknown as number[]));
  }

  async decryptMessage(encryptedMessage: string): Promise<string> {
    if (!this.encryptionKey) throw new Error("Encryption key not set");

    const encryptedData = Uint8Array.from(atob(encryptedMessage), c => c.charCodeAt(0));
    const iv = encryptedData.slice(0, 12);
    const data = encryptedData.slice(12);

    const decryptedData = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv }, this.encryptionKey, data
    );

    return new TextDecoder().decode(decryptedData);
  }
}

export default EncryptionService;