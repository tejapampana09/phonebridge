import React, { useState, useEffect } from 'react'
import {
  FileUp,
  Loader2,
  HardDrive,
  CheckCircle2,
  Folder,
  File as FileIcon,
  ArrowLeft,
  Download,
  Trash2,
  Edit2,
  X,
  FolderSync
} from 'lucide-react'

interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: number
}

interface ActiveTransfer {
  fileId: string
  fileName: string
  direction: 'upload' | 'download'
  progress: number
}

export const FilesTab: React.FC = () => {
  // --- PC to Phone State ---
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: ''
  })

  // --- Phone to PC State ---
  const [currentPath, setCurrentPath] = useState<string>('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [transfers, setTransfers] = useState<Record<string, ActiveTransfer>>({})
  
  // --- Rename Modal State ---
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renamingPath, setRenamingPath] = useState<string>('')
  const [renamingName, setRenamingName] = useState<string>('')
  const [newNameInput, setNewNameInput] = useState<string>('')

  // Shortcuts based on standard Android paths
  const shortcuts = [
    { name: 'Root', path: '/storage/emulated/0' },
    { name: 'Downloads', path: '/storage/emulated/0/Download' },
    { name: 'Documents', path: '/storage/emulated/0/Documents' },
    { name: 'Pictures', path: '/storage/emulated/0/Pictures' },
    { name: 'Videos', path: '/storage/emulated/0/DCIM' },
    { name: 'Music', path: '/storage/emulated/0/Music' },
    { name: 'WhatsApp Media', path: '/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media' }
  ]

  // Query directory files
  const fetchDirectory = async (path: string) => {
    setLoadingFiles(true)
    try {
      await window.api.listPhoneFiles(path)
    } catch (err) {
      console.error('Failed to list files:', err)
      setLoadingFiles(false)
    }
  }

  useEffect(() => {
    fetchDirectory('') // Initial fetch of root

    // Listen to real-time events from server
    const sub = window.api.onPhoneEvent((_event: any, payload: any) => {
      if (payload.type === 'FILES_LIST') {
        setCurrentPath(payload.data.path)
        setEntries(payload.data.entries || [])
        setLoadingFiles(false)
      } else if (payload.type === 'PHOTO_DOWNLOADED') {
        showToast('File downloaded successfully to your Downloads directory!')
      } else if (payload.type === 'FILE_TRANSFER_PROGRESS') {
        const { fileId, fileName, direction, progress } = payload.data
        setTransfers((prev) => {
          const next = { ...prev }
          if (progress >= 100) {
            delete next[fileId]
          } else {
            next[fileId] = { fileId, fileName, direction, progress }
          }
          return next
        })
      }
    })

    return () => {
      window.api.removePhoneEventListener(sub)
    }
  }, [])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 4000)
  }

  // --- PC to Phone drag-drop upload handlers ---
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
    setUploadStatus({ type: 'idle', message: '' })
    
    try {
      const success = await window.api.sendFileToPhone(filePath)
      if (success) {
        setUploadStatus({
          type: 'success',
          message: `Successfully transferred file to downloads directory on your phone.`
        })
      } else {
        setUploadStatus({
          type: 'error',
          message: 'Failed to send file. Make sure your phone is connected.'
        })
      }
    } catch (err) {
      console.error('File send error:', err)
      setUploadStatus({ type: 'error', message: 'An error occurred during file transfer.' })
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
      try {
        const path = window.api.getPathForFile(file)
        if (path) {
          handleFileDrop(path)
        } else {
          setUploadStatus({ type: 'error', message: 'Could not resolve file path.' })
        }
      } catch (err) {
        console.error(err)
        setUploadStatus({ type: 'error', message: 'Could not resolve file path.' })
      }
    }
  }

  // Navigate back to parent folder
  const handleGoUp = () => {
    if (!currentPath || currentPath === '/storage/emulated/0') return
    const parts = currentPath.split('/')
    parts.pop()
    const parentPath = parts.join('/')
    fetchDirectory(parentPath)
  }

  const formatSize = (bytes: number) => {
    if (bytes <= 0) return ''
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNameInput.trim() || newNameInput === renamingName) return
    try {
      await window.api.renamePhoneFile(renamingPath, newNameInput.trim())
      setShowRenameModal(false)
    } catch (err) {
      console.error(err)
      alert('Failed to rename file.')
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-primary overflow-hidden select-none">
      
      {/* Header */}
      <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Files & Storage</h2>
          <p className="text-xs text-muted mt-0.5">Browse files on your phone or drop files to upload.</p>
        </div>
      </div>

      {/* Active File Transfers Progress Queue */}
      {Object.keys(transfers).length > 0 && (
        <div className="mx-6 mt-4 p-4 bg-sidebar/55 border border-border/80 rounded-xl space-y-3 flex-shrink-0 animate-fade-in">
          <h4 className="text-xs font-bold text-white tracking-wide uppercase flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <span>Active File Transfers</span>
          </h4>
          <div className="space-y-2.5">
            {Object.values(transfers).map((t) => (
              <div key={t.fileId} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-secondary">
                  <span className="truncate max-w-[70%]" title={t.fileName}>{t.fileName}</span>
                  <span className="text-accent">
                    {t.direction === 'upload' ? 'Uploading' : 'Downloading'} ({t.progress}%)
                  </span>
                </div>
                <div className="w-full bg-card rounded-full h-1.5 overflow-hidden border border-border/40">
                  <div
                    className="bg-accent h-full rounded-full transition-all duration-155"
                    style={{ width: `${t.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT COLUMN: Phone File Browser */}
        <div className="w-[60%] border-r border-border flex flex-col h-full bg-sidebar/30">
          
          {/* Shortcuts strip */}
          <div className="p-4 border-b border-border flex items-center space-x-2 overflow-x-auto flex-shrink-0 scrollbar-none">
            {shortcuts.map((sc) => (
              <button
                key={sc.name}
                onClick={() => fetchDirectory(sc.path)}
                className="px-3 py-1.5 bg-card hover:bg-hover border border-border rounded-lg text-[10.5px] font-semibold text-secondary hover:text-white transition-all whitespace-nowrap"
              >
                {sc.name}
              </button>
            ))}
          </div>

          {/* Navigation Bar / Path */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-primary/20 flex-shrink-0">
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              <button
                onClick={handleGoUp}
                disabled={!currentPath || currentPath === '/storage/emulated/0'}
                className="p-1.5 bg-card hover:bg-hover border border-border text-secondary hover:text-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Go Up"
              >
                <ArrowLeft size={12} />
              </button>
              <div className="text-[10px] text-dim truncate font-mono bg-card/65 px-2.5 py-1.5 rounded-md border border-border/85 flex-1 select-text">
                {currentPath || 'Root'}
              </div>
            </div>
            
            <button
              onClick={() => fetchDirectory(currentPath)}
              className="ml-3 p-1.5 text-dim hover:text-white transition-colors"
              title="Refresh"
            >
              <FolderSync size={14} />
            </button>
          </div>

          {/* Directory Listings */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/10">
            {loadingFiles ? (
              <div className="h-full flex flex-col items-center justify-center text-dim space-y-3">
                <Loader2 className="animate-spin text-accent" size={24} />
                <span className="text-xs font-semibold">Reading directory contents...</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-dim space-y-1">
                <Folder size={32} className="opacity-20" />
                <span className="text-xs">No files or subfolders here.</span>
              </div>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.path}
                  className="px-4 py-3 flex items-center justify-between hover:bg-hover transition-colors group"
                >
                  <div
                    onClick={() => {
                      if (entry.isDir) {
                        fetchDirectory(entry.path)
                      }
                    }}
                    className={`flex items-center space-x-3.5 min-w-0 flex-1 ${entry.isDir ? 'cursor-pointer' : ''}`}
                  >
                    <div className="flex-shrink-0 text-accent">
                      {entry.isDir ? <Folder size={16} /> : <FileIcon size={16} className="text-secondary" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs truncate ${entry.isDir ? 'text-white font-bold' : 'text-secondary'}`}>
                        {entry.name}
                      </p>
                      {!entry.isDir && (
                        <p className="text-[9px] text-dim font-mono mt-0.5">
                          {formatSize(entry.size)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions (Visible on Row Hover) */}
                  <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-2 flex-shrink-0 transition-opacity pl-2">
                    {!entry.isDir && (
                      <button
                        onClick={() => window.api.downloadPhoneFile(entry.path)}
                        className="p-1 text-dim hover:text-white rounded hover:bg-card transition-colors"
                        title="Download to PC"
                      >
                        <Download size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setRenamingPath(entry.path)
                        setRenamingName(entry.name)
                        setNewNameInput(entry.name)
                        setShowRenameModal(true)
                      }}
                      className="p-1 text-dim hover:text-white rounded hover:bg-card transition-colors"
                      title="Rename"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete ${entry.name}?`)) {
                          try {
                            await window.api.deletePhoneFile(entry.path)
                          } catch (err) {
                            console.error(err)
                          }
                        }
                      }}
                      className="p-1 text-dim hover:text-danger rounded hover:bg-card transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: PC to Phone Upload */}
        <div className="w-[40%] flex flex-col h-full p-8 bg-primary/10">
          <div className="space-y-4 mb-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Upload to Phone</h3>
            <p className="text-xs text-muted leading-relaxed">
              Instantly push files from your computer to the phone's downloads directory. Select a file or drop it anywhere in the box.
            </p>
          </div>

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={onDrop}
            onClick={async () => {
              if (uploading) return
              try {
                const path = await window.api.openFileDialog()
                if (path) {
                  handleFileDrop(path)
                }
              } catch (err) {
                console.error('Failed to open file dialog:', err)
              }
            }}
            className={`w-full flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all duration-300 ${
              dragActive
                ? 'border-accent bg-accent/5 scale-[1.01]'
                : 'border-border hover:border-accent/40 bg-sidebar/40 hover:bg-sidebar/80'
            }`}
          >
            {uploading ? (
              <div className="space-y-4 text-secondary">
                <Loader2 className="mx-auto text-accent animate-spin" size={36} />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white">Transferring file...</p>
                  <p className="text-[10px] text-dim">Please do not unlink phone.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="w-11 h-11 rounded-full bg-card border border-border flex items-center justify-center mx-auto text-secondary shadow-md">
                  <FileUp size={20} className="text-accent" />
                </div>
                
                <div className="space-y-1 text-secondary">
                  <p className="text-xs font-semibold text-white">
                    Drag & drop files or click to browse
                  </p>
                  <p className="text-[10px] text-dim">
                    Transferred directly to Downloads/PhoneBridge/
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Upload Status Banner */}
          {uploadStatus.type !== 'idle' && (
            <div className={`mt-6 p-4 rounded-xl flex items-start space-x-3 border ${
              uploadStatus.type === 'success'
                ? 'bg-success/5 border-success/20 text-success'
                : 'bg-danger/5 border-danger/20 text-danger'
            }`}>
              {uploadStatus.type === 'success' ? (
                <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
              ) : (
                <HardDrive size={14} className="mt-0.5 flex-shrink-0" />
              )}
              <div className="text-xs leading-relaxed font-semibold">
                {uploadStatus.message}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Notifications */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-accent border border-accent/25 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center space-x-3 animate-fade-in z-50">
          <CheckCircle2 size={16} />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Rename File Dialog Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleRenameSubmit}
            className="bg-sidebar border border-border w-full max-w-sm rounded-2xl shadow-2xl p-6 relative animate-fade-in"
          >
            <button
              type="button"
              onClick={() => setShowRenameModal(false)}
              className="absolute top-4 right-4 p-1 rounded hover:bg-hover text-dim hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
            
            <div className="flex items-center space-x-3 mb-5">
              <h2 className="text-sm font-bold text-white">Rename File</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[9px] font-bold text-muted uppercase tracking-wider mb-1">New Name</label>
                <input
                  type="text"
                  required
                  value={newNameInput}
                  onChange={(e) => setNewNameInput(e.target.value)}
                  placeholder="Filename"
                  className="w-full bg-card border border-border rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-accent font-mono"
                  autoFocus
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowRenameModal(false)}
                className="px-4 py-2 bg-card border border-border text-secondary hover:text-white rounded-lg text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg text-xs font-bold shadow-md transition-colors"
              >
                Rename
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  )
}
