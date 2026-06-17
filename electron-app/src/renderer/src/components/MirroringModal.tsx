import React, { useState, useEffect } from 'react'
import { X, Tv, RefreshCw, AlertCircle } from 'lucide-react'

interface MirroringModalProps {
  onClose: () => void
}

export const MirroringModal: React.FC<MirroringModalProps> = ({ onClose }) => {
  const [frame, setFrame] = useState<string | null>(null)
  const [status, setStatus] = useState<'connecting' | 'streaming' | 'error'>('connecting')

  useEffect(() => {
    // Start mirroring on phone
    const initMirroring = async () => {
      try {
        await window.api.startMirroring()
      } catch (err) {
        console.error('Failed to request screen mirroring start:', err)
        setStatus('error')
      }
    }

    initMirroring()

    // Listen to incoming projection frames
    const sub = window.api.onPhoneEvent((_event: any, payload: any) => {
      if (payload.type === 'MIRROR_FRAME') {
        setFrame(payload.data)
        setStatus('streaming')
      }
    })

    // Timeout if no frames received after 15 seconds
    const timeout = setTimeout(() => {
      setStatus((prev) => (prev === 'connecting' ? 'error' : prev))
    }, 15000)

    return () => {
      clearTimeout(timeout)
      window.api.removePhoneEventListener(sub)
      window.api.stopMirroring().catch((err: any) => {
        console.error('Failed to send stop mirroring command:', err)
      })
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="bg-sidebar border border-border/80 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col relative">
        
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-primary/20">
          <div className="flex items-center space-x-2">
            <Tv className="text-accent animate-pulse" size={16} />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Screen Mirroring</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-hover text-dim hover:text-white transition-colors"
            title="Close Stream"
          >
            <X size={16} />
          </button>
        </div>

        {/* Viewport Frame */}
        <div className="flex-1 bg-black flex items-center justify-center relative min-h-[480px] p-6">
          {status === 'connecting' && (
            <div className="flex flex-col items-center justify-center text-center text-dim space-y-3 p-4 animate-pulse">
              <RefreshCw size={36} className="animate-spin text-accent" />
              <p className="text-xs font-medium text-white">Connecting...</p>
              <p className="text-[10px] max-w-[200px] leading-relaxed">
                Please approve the recording authorization prompt on your phone screen.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center justify-center text-center text-dim space-y-3 p-4">
              <AlertCircle size={36} className="text-danger" />
              <p className="text-xs font-medium text-white">Connection Failed</p>
              <p className="text-[10px] max-w-[220px] leading-relaxed">
                Could not connect to the device stream. Verify that your phone remains online and projection permissions are granted.
              </p>
              <button
                onClick={() => {
                  setStatus('connecting')
                  window.api.startMirroring().catch(() => setStatus('error'))
                }}
                className="mt-2 text-[10px] bg-accent/10 border border-accent/20 hover:bg-accent/20 text-accent px-3 py-1.5 rounded-lg font-bold transition-all"
              >
                Retry Request
              </button>
            </div>
          )}

          {status === 'streaming' && frame && (
            <div className="w-full max-w-[270px] aspect-[9/16] rounded-xl border border-border/80 overflow-hidden shadow-2xl bg-card">
              <img
                src={`data:image/jpeg;base64,${frame}`}
                alt="Phone Screen Mirror Frame"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {status === 'streaming' && !frame && (
            <div className="flex flex-col items-center justify-center text-center text-dim space-y-2 animate-pulse">
              <RefreshCw size={24} className="animate-spin text-muted" />
              <p className="text-[10px]">Initializing frame buffer...</p>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-primary/30 border-t border-border/40 text-center">
          <span className="text-[9px] text-dim uppercase font-semibold">
            {status === 'streaming' ? 'Live Stream Active (JPEG ~7 FPS)' : 'Waiting for connection'}
          </span>
        </div>

      </div>
    </div>
  )
}
