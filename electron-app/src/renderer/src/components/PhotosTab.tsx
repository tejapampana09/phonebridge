import React, { useState, useEffect } from 'react'
import { PhotoMeta } from '../types'
import { Image, Calendar, HardDrive, Camera, Download, Loader2, X, ChevronLeft, ChevronRight } from 'lucide-react'

interface PhotosTabProps {
  photos: PhotoMeta[]
}

export const PhotosTab: React.FC<PhotosTabProps> = ({ photos }) => {
  const [photoData, setPhotoData] = useState<Record<string, string>>({})
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null)
  const pendingOpenIdRef = React.useRef<string | null>(null)

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes <= 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // Format date
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString)
      return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return ''
    }
  }

  // Fetch local image base64 data for all photos
  useEffect(() => {
    const loadPhotoData = async () => {
      const dataMap: Record<string, string> = {}
      for (const photo of photos) {
        try {
          const data = await window.api.getPhotoData(photo.id)
          if (data) {
            dataMap[photo.id] = data
          }
        } catch (err) {
          console.error(`Error loading data for photo ${photo.id}:`, err)
        }
      }
      setPhotoData(dataMap)
    }
    loadPhotoData()
  }, [photos])

  // Listen to PHOTO_DOWNLOADED event to load newly downloaded image
  useEffect(() => {
    const subscription = window.api.onPhoneEvent(async (_event: any, payload: any) => {
      if (payload.type === 'PHOTO_DOWNLOADED') {
        const { id } = payload.data
        try {
          const data = await window.api.getPhotoData(id)
          if (data) {
            setPhotoData((prev) => ({ ...prev, [id]: data }))
            if (pendingOpenIdRef.current === id) {
              const idx = photos.findIndex((p) => p.id === id)
              if (idx !== -1) {
                setSelectedPhotoIndex(idx)
              }
              pendingOpenIdRef.current = null
            }
          }
          setDownloadingIds((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
        } catch (err) {
          console.error(`Error updating photo data for ${id}:`, err)
        }
      }
    })

    return () => {
      window.api.removePhoneEventListener(subscription)
    }
  }, [photos])

  const handleDownload = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDownloadingIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })

    try {
      const success = await window.api.downloadPhoto(id)
      if (!success) {
        alert('Failed to request photo download. Ensure your phone is connected.')
        setDownloadingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    } catch (err) {
      console.error('Failed to trigger downloadPhoto IPC:', err)
      setDownloadingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleCardClick = async (index: number, id: string) => {
    if (photoData[id]) {
      setSelectedPhotoIndex(index)
    } else {
      if (downloadingIds.has(id)) return
      pendingOpenIdRef.current = id
      setDownloadingIds((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      })

      try {
        const success = await window.api.downloadPhoto(id)
        if (!success) {
          alert('Failed to request photo download. Ensure your phone is connected.')
          setDownloadingIds((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
          pendingOpenIdRef.current = null
        }
      } catch (err) {
        console.error('Failed to trigger downloadPhoto IPC:', err)
        setDownloadingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        pendingOpenIdRef.current = null
      }
    }
  }

  const navigateLightbox = (direction: 'next' | 'prev') => {
    if (selectedPhotoIndex === null) return
    let newIndex = selectedPhotoIndex
    const step = direction === 'next' ? 1 : -1
    
    // Find the next downloaded photo
    do {
      newIndex = (newIndex + step + photos.length) % photos.length
    } while (!photoData[photos[newIndex].id] && newIndex !== selectedPhotoIndex)

    if (photoData[photos[newIndex].id]) {
      setSelectedPhotoIndex(newIndex)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-primary overflow-hidden select-none">
      
      {/* Header */}
      <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Recent Photos</h2>
          <p className="text-xs text-muted mt-0.5">Click photo to view full size. Missing photos can be downloaded on-demand.</p>
        </div>
        
        {/* Count Badge */}
        {photos.length > 0 && (
          <div className="text-xs font-semibold px-3 py-1.5 bg-accent/10 border border-accent/30 text-accent rounded-lg">
            {photos.length} Photos synced
          </div>
        )}
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {photos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-dim space-y-3">
            <Camera size={48} className="opacity-25 animate-pulse text-accent" />
            <p className="text-sm font-semibold">No synced photos found</p>
            <p className="text-xs max-w-sm px-6">
              When connected, metadata for the newest images in your phone's gallery will show up here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {photos.map((photo, index) => {
              const isDownloaded = !!photoData[photo.id]
              const isDownloading = downloadingIds.has(photo.id)
              
              return (
                <div
                  key={photo.id}
                  onClick={() => handleCardClick(index, photo.id)}
                  className={`group bg-sidebar border border-border/80 hover:border-accent/40 rounded-xl overflow-hidden shadow-lg transition-all duration-300 ${
                    isDownloaded ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl' : ''
                  }`}
                >
                  
                  {/* Photo Thumbnail Container */}
                  <div className="aspect-square bg-card border-b border-border flex flex-col items-center justify-center relative group-hover:bg-hover transition-colors overflow-hidden">
                    {isDownloaded ? (
                      <img
                        src={photoData[photo.id]}
                        alt={photo.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : photo.thumbnail ? (
                      <div className="w-full h-full relative">
                        <img
                          src={photo.thumbnail}
                          alt={photo.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 blur-[0.5px]"
                        />
                        {isDownloading ? (
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
                            <Loader2 className="animate-spin text-accent" size={28} />
                          </div>
                        ) : (
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Download size={20} className="text-white drop-shadow-md animate-bounce" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <Image size={36} className="text-dim group-hover:text-accent/60 transition-colors" />
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex flex-col items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                          {isDownloading ? (
                            <Loader2 className="animate-spin text-accent" size={28} />
                          ) : (
                            <button
                              onClick={(e) => handleDownload(photo.id, e)}
                              className="w-10 h-10 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center shadow-lg transition-all duration-150 transform hover:scale-110"
                              title="Download full size photo"
                            >
                              <Download size={18} />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                    <span className="absolute bottom-2.5 right-2.5 bg-black/60 backdrop-blur-sm text-[9px] px-1.5 py-0.5 rounded text-secondary font-medium">
                      {photo.name.split('.').pop()?.toUpperCase() || 'JPG'}
                    </span>
                  </div>

                  {/* Metadata Details */}
                  <div className="p-3.5 space-y-2">
                    <h4 className="text-xs font-bold text-white truncate" title={photo.name}>
                      {photo.name}
                    </h4>
                    
                    <div className="flex flex-col space-y-1 text-[10px] text-muted">
                      <div className="flex items-center space-x-1.5">
                        <HardDrive size={10} />
                        <span>{formatSize(photo.size)}</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <Calendar size={10} />
                        <span>{formatDate(photo.timestamp)}</span>
                      </div>
                    </div>
                  </div>

                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Full screen Lightbox Modal */}
      {selectedPhotoIndex !== null && photos[selectedPhotoIndex] && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
          {/* Top panel controls */}
          <div className="absolute top-4 right-4 flex items-center space-x-4">
            <button
              onClick={() => setSelectedPhotoIndex(null)}
              className="p-2.5 bg-sidebar hover:bg-hover border border-border text-white rounded-full transition-all"
              title="Close viewer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Left Arrow */}
          <button
            onClick={() => navigateLightbox('prev')}
            className="absolute left-6 p-3 bg-sidebar/50 hover:bg-sidebar hover:scale-105 border border-border/50 text-white rounded-full transition-all"
          >
            <ChevronLeft size={24} />
          </button>

          {/* Main Display Image */}
          <div className="max-w-[80vw] max-h-[80vh] flex items-center justify-center">
            <img
              src={photoData[photos[selectedPhotoIndex].id]}
              alt={photos[selectedPhotoIndex].name}
              className="max-w-full max-h-full object-contain rounded-lg border border-border shadow-2xl animate-fade-in"
            />
          </div>

          {/* Right Arrow */}
          <button
            onClick={() => navigateLightbox('next')}
            className="absolute right-6 p-3 bg-sidebar/50 hover:bg-sidebar hover:scale-105 border border-border/50 text-white rounded-full transition-all"
          >
            <ChevronRight size={24} />
          </button>

          {/* Photo Info Bottom Panel */}
          <div className="absolute bottom-6 bg-sidebar/90 border border-border rounded-xl px-6 py-3 text-center space-y-0.5 shadow-xl max-w-md w-full">
            <h3 className="text-sm font-semibold text-white truncate">
              {photos[selectedPhotoIndex].name}
            </h3>
            <p className="text-xs text-muted">
              {formatSize(photos[selectedPhotoIndex].size)} • {formatDate(photos[selectedPhotoIndex].timestamp)}
            </p>
          </div>
        </div>
      )}

    </div>
  )
}
