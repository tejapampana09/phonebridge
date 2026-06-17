import React, { useState, useEffect } from 'react'
import { QrCode, Smartphone, RefreshCw, Wifi, Bluetooth } from 'lucide-react'

interface PairingScreenProps {
  onCheckStatus: () => void
}

export const PairingScreen: React.FC<PairingScreenProps> = ({ onCheckStatus }) => {
  const [qrCode, setQrCode] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [statusText, setStatusText] = useState<string>('Generating connection details...')

  const fetchQRCode = async () => {
    setLoading(true)
    setStatusText('Generating QR code...')
    try {
      const code = await window.api.getQRCode()
      setQrCode(code)
      setLoading(false)
      setStatusText('Waiting for phone to scan...')
    } catch (err) {
      console.error('Error fetching QR code:', err)
      setStatusText('Failed to generate QR. Make sure you are connected to network.')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQRCode()
    
    // Poll connection status while waiting on pairing screen
    const interval = setInterval(() => {
      onCheckStatus()
    }, 2500)

    return () => clearInterval(interval)
  }, [onCheckStatus])

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-40px)] bg-primary text-white p-8">
      <div className="max-w-md w-full bg-sidebar border border-border rounded-xl p-8 shadow-2xl flex flex-col items-center space-y-6">
        
        {/* Header Title & Logo */}
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-accent/25 rounded-lg border border-accent/40 text-accent animate-pulse">
            <Smartphone size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">PhoneBridge</h1>
            <p className="text-xs text-muted">Microsoft Phone Link Clone</p>
          </div>
        </div>

        {/* Pairing Instructions */}
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-white">Pair your phone</h2>
          <p className="text-sm text-secondary px-4 leading-relaxed">
            Open the <strong className="text-accent">PhoneBridge</strong> app on your Android device and scan the QR code below.
          </p>
        </div>

        {/* QR Code Container */}
        <div className="relative w-64 h-64 bg-white rounded-xl p-4 flex items-center justify-center shadow-lg border border-border/20 transition-all duration-300 hover:scale-105">
          {loading ? (
            <div className="flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="animate-spin text-accent" size={40} />
              <p className="text-xs text-dim">Please wait...</p>
            </div>
          ) : qrCode ? (
            <img src={qrCode} alt="Pairing QR Code" className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center justify-center text-danger text-center p-4">
              <QrCode size={48} className="mb-2" />
              <p className="text-xs">Connection details unavailable. Check your local IP.</p>
            </div>
          )}
        </div>

        {/* Connection Modes */}
        <div className="flex items-center justify-center space-x-6 text-xs text-secondary bg-primary/40 px-4 py-2 rounded-lg border border-border/50">
          <div className="flex items-center space-x-1.5">
            <Wifi size={14} className="text-success" />
            <span>Local WiFi (Primary)</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center space-x-1.5">
            <Bluetooth size={14} className="text-accent" />
            <span>Bluetooth SPP (Fallback)</span>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center space-x-2 text-xs font-medium py-1 px-3 bg-card rounded-full border border-border">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>
          <span className="text-muted">{statusText}</span>
        </div>

        {/* Refresh Button */}
        <button
          onClick={fetchQRCode}
          disabled={loading}
          className="flex items-center space-x-2 text-xs text-secondary hover:text-white bg-card border border-border px-4 py-2 rounded-lg transition-colors duration-200"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh QR Code</span>
        </button>

      </div>
    </div>
  )
}
