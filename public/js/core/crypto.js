/**
 * Frontend E2E Encryption Module using Web Crypto API.
 * Interoperable with Node.js AES-256-GCM.
 */

// Utility: Base64 string to Uint8Array
function base64ToBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// Utility: Uint8Array to Base64 string
function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

/**
 * Imports a raw 32-byte ArrayBuffer key for AES-GCM operations.
 */
async function importAESKey(rawKeyBuffer) {
    return await window.crypto.subtle.importKey(
        "raw",
        rawKeyBuffer,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * Decrypts an EncryptedEnvelope coming from the Node/Server.
 * WebCrypto expects the AuthTag to be appended to the end of the ciphertext.
 * 
 * @param {Object} envelope - { header, nonce, ciphertext, authTag }
 * @param {ArrayBuffer} sessionKeyBuffer - 32-byte key
 */
export async function decryptPayload(envelope, sessionKeyBuffer) {
    const cryptoKey = await importAESKey(sessionKeyBuffer);

    // 1. Time Drift Check (Replay Protection)
    const now = Date.now();
    if (Math.abs(now - envelope.header.timestamp) > 30000) {
        throw new Error("E2E Decryption failed: Timestamp out of bounds.");
    }

    // 2. Prepare parameters
    const iv = base64ToBuffer(envelope.nonce);
    const aad = new TextEncoder().encode(JSON.stringify(envelope.header));

    // 3. Concatenate Ciphertext and AuthTag for WebCrypto API
    const cipherBytes = base64ToBuffer(envelope.ciphertext);
    const tagBytes = base64ToBuffer(envelope.authTag);

    const combinedData = new Uint8Array(cipherBytes.length + tagBytes.length);
    combinedData.set(cipherBytes, 0);
    combinedData.set(tagBytes, cipherBytes.length);

    // 4. Decrypt
    try {
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv, additionalData: aad },
            cryptoKey,
            combinedData
        );
        return new TextDecoder().decode(decryptedBuffer);
    } catch (e) {
        throw new Error("E2E Integrity Failed: Ciphertext or AAD tampered with.");
    }
}

/**
 * Encrypts a payload to send to the Node.
 */
export async function encryptPayload(payloadString, sessionKeyBuffer, keyId = "dashboard-ephemeral") {
    const cryptoKey = await importAESKey(sessionKeyBuffer);

    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const header = {
        version: "1.0",
        keyId: keyId,
        messageId: crypto.randomUUID(),
        timestamp: Date.now()
    };

    const aad = new TextEncoder().encode(JSON.stringify(header));
    const encodedPayload = new TextEncoder().encode(payloadString);

    const encryptedCombined = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv, additionalData: aad },
        cryptoKey,
        encodedPayload
    );

    // WebCrypto appends the 16-byte auth tag to the end of the ciphertext. We must split it for Node.js.
    const encryptedBytes = new Uint8Array(encryptedCombined);
    const ciphertextBytes = encryptedBytes.slice(0, encryptedBytes.length - 16);
    const authTagBytes = encryptedBytes.slice(encryptedBytes.length - 16);

    return {
        header,
        nonce: bufferToBase64(iv),
        ciphertext: bufferToBase64(ciphertextBytes),
        authTag: bufferToBase64(authTagBytes)
    };
}