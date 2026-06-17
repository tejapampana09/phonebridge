import React from 'react'
import { PhotoMeta } from '../types'
import { Image, Calendar, HardDrive, Camera } from 'lucide-react'

interface PhotosTabProps {
  photos: PhotoMeta[]
}

export const PhotosTab: React.FC<PhotosTabProps> = ({ photos }) => {
  
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

  return (
    <div className="flex-1 flex flex-col h-full bg-primary overflow-hidden">
      
      {/* Header */}
      <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Recent Photos</h2>
          <p className="text-xs text-muted mt-0.5">Showing recent camera photos metadata from your phone</p>
        </div>
        
        {/* Count Badge */}
        {photos.length > 0 && (
          <div className="text-xs font-semibold px-3 py-1.5 bg-accent/10 border border-accent/30 text-accent rounded-lg">
            {photos.length} Photos Sync'd
          </div>
        )}
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {photos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-dim space-y-3">
            <Camera size={48} className="opacity-25 animate-bounce" />
            <p className="text-sm font-semibold">No synced photos found</p>
            <p className="text-xs max-w-sm px-6">
              When connected, metadata for the newest images in your phone's gallery will show up here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="group bg-sidebar border border-border/80 hover:border-accent/40 rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                
                {/* Photo Thumbnail Mockup */}
                <div className="aspect-square bg-card border-b border-border flex flex-col items-center justify-center relative group-hover:bg-hover transition-colors">
                  <Image size={36} className="text-dim group-hover:text-accent transition-colors" />
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
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
