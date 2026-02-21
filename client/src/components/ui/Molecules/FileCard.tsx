import React from 'react'
import { Lock } from 'lucide-react'

interface FileCardProps {
  fileName: string
  sizeBytes?: number
  progress?: number // 0 - 100
}

const prettySize = (bytes?: number) => {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
}

export const FileCard: React.FC<FileCardProps> = ({ fileName, sizeBytes, progress = 0 }) => {
  return (
    <div className="border border-white/10 p-3 bg-black flex items-center gap-3 w-full max-w-sm hover:border-white/20 transition-colors">
      <div className="shrink-0 text-white/30">
        <Lock size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[11px] text-white/40 uppercase tracking-widest mb-0.5">Encrypted File</div>
        <div className="text-[13px] font-medium text-white/80 truncate" title={fileName}>{fileName}</div>
        {sizeBytes != null && (
          <div className="font-mono text-[10px] text-white/25 mt-0.5">{prettySize(sizeBytes)}</div>
        )}
        {progress > 0 && progress < 100 && (
          <div className="h-px bg-white/10 mt-2 w-full overflow-hidden">
            <div
              className="h-px bg-white transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default FileCard
