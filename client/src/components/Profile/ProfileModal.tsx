import React, { useState, useRef } from 'react';
import { X, Camera } from 'lucide-react';
import { Button } from '../ui/Button';

interface ProfileModalProps {
  userId: string;
  deviceId: string;
  avatarUrl?: string | null;
  statusText?: string | null;
  onClose: () => void;
  onProfileUpdated: (updates: { avatarUrl?: string; statusText?: string }) => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${localStorage.getItem('authToken') ?? ANON_KEY}`,
  };
}

// Converts any image to a 256×256 JPEG (center-cropped square).
// Accepts any format the browser supports (PNG, WebP, GIF, HEIC, etc.).
const AVATAR_SIZE = 256;

async function compressToJpeg(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      // Center-crop to square, then scale to AVATAR_SIZE×AVATAR_SIZE
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;

      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

      // JPEG, start at quality 0.9, step down until within maxBytes
      let quality = 0.9;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length * 0.75 > maxBytes && quality > 0.3) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(dataUrl);
    };
    img.onerror = reject;
    img.src = url;
  });
}

const ProfileModal: React.FC<ProfileModalProps> = ({
  userId,
  deviceId,
  avatarUrl: initialAvatarUrl,
  statusText: initialStatusText,
  onClose,
  onProfileUpdated,
}) => {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl ?? null);
  const [statusText, setStatusText] = useState(initialStatusText ?? '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !SUPABASE_URL) return;
    setError(null);
    setUploadingAvatar(true);
    try {
      const base64 = await compressToJpeg(file, 80 * 1024);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/user_profile_update`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ user_id: userId, device_id: deviceId, avatar_base64: base64 }),
      });
      const data = await res.json() as { ok?: boolean; avatar_url?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Upload failed');
      const newUrl = data.avatar_url ?? null;
      setAvatarUrl(newUrl);
      if (newUrl) onProfileUpdated({ avatarUrl: newUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleStatusSave = async () => {
    if (!SUPABASE_URL) return;
    setError(null);
    setSavingStatus(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/user_profile_update`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ user_id: userId, device_id: deviceId, status_text: statusText }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Save failed');
      onProfileUpdated({ statusText });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save status');
    } finally {
      setSavingStatus(false);
    }
  };

  const initials = userId.charAt(0).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full sm:w-[360px] bg-[#0a0a0a] border border-white/10 sm:rounded-xl rounded-t-2xl p-6 space-y-6 animate-fade-up z-10">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-white/30 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">Profile</p>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-16 h-16 rounded-full object-cover border border-white/15"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white/8 border border-white/15 flex items-center justify-center text-[22px] font-semibold text-white/50 select-none">
                {initials}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingAvatar ? (
                <span className="font-mono text-[10px] text-white/70">…</span>
              ) : (
                <Camera size={18} className="text-white/80" />
              )}
            </div>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="font-mono text-[10px] text-white/30 hover:text-white/60 transition-colors uppercase tracking-widest disabled:cursor-wait"
          >
            {uploadingAvatar ? 'uploading…' : 'Change photo'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        {/* Username (read-only) */}
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-white/25 uppercase tracking-widest">Username</p>
          <p className="text-[14px] text-white/70">{userId}</p>
        </div>

        {/* Status text */}
        <div className="space-y-2">
          <p className="font-mono text-[10px] text-white/25 uppercase tracking-widest">Status</p>
          <textarea
            value={statusText}
            onChange={(e) => setStatusText(e.target.value)}
            maxLength={80}
            rows={2}
            placeholder="What's on your mind?"
            className="w-full bg-white/[0.04] border border-white/8 focus:border-white/25 rounded-lg px-3 py-2 text-[14px] text-white/80 placeholder:text-white/20 outline-none resize-none transition-colors"
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-white/20">{statusText.length}/80</span>
            <Button
              variant="primary"
              onClick={handleStatusSave}
              disabled={savingStatus}
              className="text-[11px] py-1.5 px-4"
            >
              {savingStatus ? '…' : 'Save'}
            </Button>
          </div>
        </div>

        {error && (
          <p className="font-mono text-[11px] text-red-400/70">{error}</p>
        )}
      </div>
    </div>
  );
};

export default ProfileModal;
