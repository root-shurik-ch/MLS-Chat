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
  if (mb < 1) {
    return `${(bytes / 1024).toFixed(0)} KB`
  }
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
}

export const FileCard: React.FC<FileCardProps> = ({ fileName, sizeBytes, progress = 0 }) => {
  const isSmall = (sizeBytes ?? 0) < 100 * 1024 * 1024
  return (
    <div className="border border-white/10 p-3 bg-black flex items-center space-x-3 w-full max-w-sm">
      <div className="flex-shrink-0 text-white/60"><Lock size={14} /></div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">Encrypted File</div>
        <div className="text-xs text-white/70 truncate" title={fileName}>{fileName}</div>
        {isSmall && (
          <div className="h-1 bg-white/10 mt-2 w-full">
            <div className="h-1" style={{ width: `${Math.max(0, Math.min(100, progress))}%`, backgroundColor: 'white' }} />
          </div>
        )}
      </div>
    </div>
  )
}

export default FileCard
