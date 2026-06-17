import React, { useState, useRef } from 'react'
import { FileUp, Loader2, HardDrive, CheckCircle2 } from 'lucide-react'

export const FilesTab: React.FC = () => {
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: ''
  })
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleFileDrop = async (filePath: string) => {
    setUploading(true)
    setStatus({ type: 'idle', message: '' })
    
    try {
      const success = await window.api.sendFileToPhone(filePath)
      if (success) {
        setStatus({
          type: 'success',
          message: `Successfully transferred file to downloads directory on your phone.`
        })
      } else {
        setStatus({
          type: 'error',
          message: 'Failed to send file. Make sure your phone is connected.'
        })
      }
    } catch (err) {
      console.error('File send error:', err)
      setStatus({ type: 'error', message: 'An error occurred during file transfer.' })
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      // Use Electron's native file path property
      const path = (file as any).path
      if (path) {
        handleFileDrop(path)
      } else {
        setStatus({ type: 'error', message: 'Could not resolve file path.' })
      }
    }
  }

  const onFileSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      const path = (file as any).path
      if (path) {
        handleFileDrop(path)
      }
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-primary overflow-hidden">
      
      {/* Header */}
      <div className="p-6 border-b border-border flex-shrink-0">
        <h2 className="text-xl font-bold text-white tracking-tight">File Transfer</h2>
        <p className="text-xs text-muted mt-0.5">Drop files below to instantly send them to your phone</p>
      </div>

      {/* Main Box */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full max-w-xl aspect-video border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all duration-300 ${
            dragActive
              ? 'border-accent bg-accent/5 scale-[1.01]'
              : 'border-border hover:border-accent/40 bg-sidebar/40 hover:bg-sidebar/80'
          }`}
        >
          {/* File input (hidden) */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileSelectChange}
            className="hidden"
          />

          {uploading ? (
            <div className="space-y-4 text-secondary">
              <Loader2 className="mx-auto text-accent animate-spin" size={44} />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">Transferring file...</p>
                <p className="text-xs text-dim">Please do not disconnect your phone link.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-full bg-card border border-border flex items-center justify-center mx-auto text-secondary shadow-md">
                <FileUp size={24} className="text-accent" />
              </div>
              
              <div className="space-y-1 text-secondary">
                <p className="text-sm font-semibold text-white">
                  Drag and drop a file here or click to browse
                </p>
                <p className="text-xs text-dim">
                  Supports all formats (photos, documents, binaries) up to 100MB
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Status Messages */}
        {status.type !== 'idle' && (
          <div className={`mt-6 w-full max-w-xl p-4 rounded-xl flex items-start space-x-3 border ${
            status.type === 'success'
              ? 'bg-success/5 border-success/20 text-success'
              : 'bg-danger/5 border-danger/20 text-danger'
          }`}>
            {status.type === 'success' ? (
              <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
            ) : (
              <HardDrive size={16} className="mt-0.5 flex-shrink-0" />
            )}
            <div className="text-xs font-semibold leading-relaxed">
              {status.message}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
