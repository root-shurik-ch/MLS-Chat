/**
 * AES-256-GCM file encryption/decryption for E2E encrypted file sharing.
 * Each file gets a fresh random key + IV, which are sent inside the
 * MLS-encrypted message payload so only group members can decrypt.
 */

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

export async function encryptFile(file: File | Blob): Promise<{
  encryptedBytes: Uint8Array;
  keyB64: string;
  ivB64: string;
}> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const fileBytes = await file.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    cryptoKey,
    fileBytes,
  );

  return {
    encryptedBytes: new Uint8Array(encrypted),
    keyB64: btoa(String.fromCharCode(...key)),
    ivB64: btoa(String.fromCharCode(...iv)),
  };
}

export async function decryptFile(
  encryptedBytes: ArrayBuffer,
  keyB64: string,
  ivB64: string,
): Promise<ArrayBuffer> {
  const key = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(key),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    cryptoKey,
    encryptedBytes,
  );
}

/**
 * Compress an image for chat: resize to max 1920px on longest side,
 * encode as JPEG quality 0.85 (reduce to 0.5 if still > 1.5 MB).
 */
export function compressImageForChat(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      const MAX = 1920;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      const MAX_BYTES = 1.5 * 1024 * 1024;
      let quality = 0.85;
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
          if (blob.size > MAX_BYTES) {
            canvas.toBlob(
              (blob2) => { resolve(blob2 ?? blob); },
              'image/jpeg',
              0.5,
            );
          } else {
            resolve(blob);
          }
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Extract the first frame of a video as a JPEG data URL (320px wide thumbnail).
 */
export function extractVideoThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadeddata = () => {
      video.currentTime = 0;
    };

    video.onseeked = () => {
      const THUMB_W = 320;
      const aspect = video.videoHeight / video.videoWidth;
      const canvas = document.createElement('canvas');
      canvas.width = THUMB_W;
      canvas.height = Math.round(THUMB_W * aspect);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      cleanup();
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };

    video.onerror = () => { cleanup(); resolve(null); };
    video.src = url;
  });
}
