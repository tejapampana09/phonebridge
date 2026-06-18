import React from 'react'
import { PhoneNotification, DeviceStatus } from '../types'
import {
  Wifi,
  WifiOff,
  Battery,
  BatteryCharging,
  Signal,
  RefreshCw,
  Bell,
  X,
  Trash2,
  Smartphone,
  Send,
  Volume2,
  VolumeX,
  Flashlight as FlashlightIcon,
  MapPin,
  MonitorPlay
} from 'lucide-react'

interface SidebarProps {
  deviceStatus: DeviceStatus | null
  notifications: PhoneNotification[]
  onDismissNotification: (id: string) => void
  onRequestSync: () => void
  onSendReply: (id: string, message: string) => void
  onOpenMirroring?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  deviceStatus,
  notifications,
  onDismissNotification,
  onRequestSync,
  onSendReply,
  onOpenMirroring
}) => {
  const isConnected = deviceStatus?.connected || false
  const batteryPercent = deviceStatus?.battery ?? 0
  const isCharging = deviceStatus?.charging || false
  const networkType = deviceStatus?.network || 'offline'
  const signalLevel = deviceStatus?.signal ?? 0
  const deviceName = deviceStatus?.deviceName || 'Android Device'

  // Get first letter for avatar
  const avatarLetter = deviceName.charAt(0).toUpperCase()

  // State for notification quick reply
  const [replyingId, setReplyingId] = React.useState<string | null>(null)
  const [replyText, setReplyText] = React.useState('')
  const [lastSyncedClip, setLastSyncedClip] = React.useState('')

  // Device Actions State
  const [flashlightOn, setFlashlightOn] = React.useState(false)
  const [isRinging, setIsRinging] = React.useState(false)
  const [isLocating, setIsLocating] = React.useState(false)
  const [locationCoords, setLocationCoords] = React.useState<{ lat: number; lng: number } | null>(null)
  React.useEffect(() => {
    const handlePhoneEvent = (_event: any, payload: any) => {
      if (payload.type === 'CLIPBOARD_CHANGED') {
        setLastSyncedClip(payload.data.text)
      } else if (payload.type === 'LOCATE_DEVICE_RESP') {
        setIsLocating(false)
        if (payload.data && payload.data.success) {
          setLocationCoords({ lat: payload.data.lat, lng: payload.data.lng })
        } else {
          alert('Failed to get phone location. Ensure GPS is enabled.')
        }
      }
    }
    const sub = window.api.onPhoneEvent(handlePhoneEvent)
    return () => {
      window.api.removePhoneEventListener(sub)
    }
  }, [])

  // Format notification time
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <aside className="w-80 bg-sidebar border-r border-border flex flex-col h-full overflow-hidden select-none">
      
      {/* 1. Device Info Panel */}
      <div className="p-6 border-b border-border flex flex-col space-y-4">
        
        {/* Avatar, Name and Link Status */}
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-accent text-lg font-bold">
            {avatarLetter}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{deviceName}</h3>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-dim'}`} />
              <span className="text-xs text-muted">
                {isConnected
                  ? deviceStatus?.btConnected
                    ? 'Linked via Bluetooth'
                    : 'Linked via Local WiFi'
                  : 'Offline'}
              </span>
            </div>
          </div>
          
          {/* Manual Sync Button */}
          <button
            onClick={onRequestSync}
            disabled={!isConnected}
            className="p-2 bg-card border border-border text-secondary hover:text-white rounded-lg transition-colors hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
            title="Request Sync"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Status Bar Indicators & Actions Container */}
        {isConnected && (
          <div className="bg-primary/40 p-2.5 rounded-lg border border-border/60 text-xs">
            {/* Status Bar Indicators (Battery, WiFi, Signal) */}
            <div className="grid grid-cols-3 gap-2">
              
              {/* Battery */}
              <div className="flex flex-col items-center justify-center space-y-1 text-secondary">
                <div className="flex items-center space-x-1">
                  {isCharging ? (
                    <BatteryCharging size={14} className="text-success" />
                  ) : (
                    <Battery size={14} className={batteryPercent < 20 ? 'text-danger' : 'text-secondary'} />
                  )}
                  <span className="font-semibold">{batteryPercent}%</span>
                </div>
                <span className="text-[10px] text-dim font-medium">Battery</span>
              </div>

              {/* Network / WiFi */}
              <div className="flex flex-col items-center justify-center space-y-1 text-secondary">
                <div className="flex items-center space-x-1">
                  {networkType === 'offline' ? (
                    <WifiOff size={14} className="text-danger" />
                  ) : (
                    <Wifi size={14} className="text-accent" />
                  )}
                  <span className="font-semibold capitalize truncate max-w-[40px] text-[10px]">
                    {networkType}
                  </span>
                </div>
                <span className="text-[10px] text-dim font-medium">Network</span>
              </div>

              {/* Signal */}
              <div className="flex flex-col items-center justify-center space-y-1 text-secondary">
                <div className="flex items-center space-x-1">
                  <Signal size={14} className={signalLevel > 0 ? 'text-accent' : 'text-dim'} />
                  <span className="font-semibold">{signalLevel}/4</span>
                </div>
                <span className="text-[10px] text-dim font-medium">Signal</span>
              </div>

            </div>

            {/* Device Actions Panel */}
            <div className="border-t border-border/60 pt-3.5 mt-3.5 space-y-2 select-none">
              <span className="text-[10px] text-muted font-bold tracking-wider uppercase">
                Device Actions
              </span>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {/* Flashlight */}
                <button
                  onClick={async () => {
                    const nextState = !flashlightOn
                    setFlashlightOn(nextState)
                    await window.api.toggleFlashlight(nextState)
                  }}
                  className={`flex items-center justify-center space-x-1.5 p-2 rounded-lg border text-[10px] font-bold transition-all ${
                    flashlightOn
                      ? 'bg-success/15 border-success/35 text-success'
                      : 'bg-card border-border hover:bg-hover text-secondary hover:text-white'
                  }`}
                  title="Toggle Flashlight"
                >
                  <FlashlightIcon size={12} />
                  <span>Flashlight</span>
                </button>

                {/* Ring Phone */}
                <button
                  onClick={async () => {
                    if (isRinging) {
                      setIsRinging(false)
                      await window.api.stopRinging()
                    } else {
                      setIsRinging(true)
                      await window.api.ringPhone()
                    }
                  }}
                  className={`flex items-center justify-center space-x-1.5 p-2 rounded-lg border text-[10px] font-bold transition-all ${
                    isRinging
                      ? 'bg-danger/15 border-danger/35 text-danger animate-pulse'
                      : 'bg-card border-border hover:bg-hover text-secondary hover:text-white'
                  }`}
                  title="Ring Device to Find it"
                >
                  {isRinging ? <VolumeX size={12} /> : <Volume2 size={12} />}
                  <span>{isRinging ? 'Mute Ring' : 'Find Phone'}</span>
                </button>

                {/* Locate Phone */}
                <button
                  onClick={async () => {
                    setIsLocating(true)
                    setLocationCoords(null)
                    await window.api.locateDevice()
                  }}
                  disabled={isLocating}
                  className="flex items-center justify-center space-x-1.5 p-2 bg-card border border-border hover:bg-hover text-secondary hover:text-white rounded-lg text-[10px] font-bold transition-all disabled:opacity-50"
                  title="Get Phone Location"
                >
                  <MapPin size={12} className={isLocating ? 'animate-bounce text-accent' : ''} />
                  <span>{isLocating ? 'Locating...' : 'Locate Device'}</span>
                </button>

                {/* Mirror Screen (Frozen / Postponed) */}
                <button
                  disabled
                  className="flex items-center justify-center space-x-1.5 p-2 bg-card border border-border text-dim opacity-50 rounded-lg text-[10px] font-bold cursor-not-allowed select-none"
                  title="Screen Mirroring (Coming Soon)"
                >
                  <MonitorPlay size={12} />
                  <span>Mirror Screen (Soon)</span>
                </button>
              </div>

              {/* Location Google Maps URL Link */}
              {locationCoords && (
                <div className="bg-card p-2 rounded-lg border border-border/80 flex items-center justify-between text-[10px] mt-1.5">
                  <span className="text-secondary truncate">Location acquired</span>
                  <a
                    href={`https://maps.google.com/?q=${locationCoords.lat},${locationCoords.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline font-bold flex-shrink-0"
                  >
                    Open Google Maps
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* 1.5 Synced Clipboard Sync Section */}
      {isConnected && (
        <div className="p-4 mx-4 mb-4 bg-primary/30 border border-border/60 rounded-xl space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted font-bold tracking-wider uppercase flex items-center space-x-1">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              <span>Synced Clipboard</span>
            </span>
            <button
              onClick={async () => {
                try {
                  const pcClip = await window.api.getClipboard()
                  if (pcClip) {
                    const ok = await window.api.sendClipboardToPhone(pcClip)
                    if (ok) {
                      alert('PC clipboard sent to phone!')
                    }
                  } else {
                    alert('PC clipboard is empty.')
                  }
                } catch (err) {
                  console.error(err)
                }
              }}
              className="text-[10px] text-accent font-semibold hover:underline"
            >
              Push PC Clip
            </button>
          </div>
          {lastSyncedClip ? (
            <div className="flex items-start justify-between space-x-2 bg-card p-2.5 rounded-lg border border-border/60">
              <p className="text-xs text-secondary line-clamp-2 break-all pr-1 flex-1 font-mono">
                {lastSyncedClip}
              </p>
              <button
                onClick={() => {
                  window.api.setClipboard(lastSyncedClip)
                  alert('Copied to PC clipboard!')
                }}
                className="text-[10px] bg-accent/10 border border-accent/20 hover:bg-accent/20 text-accent px-2 py-1 rounded flex-shrink-0 font-bold transition-all"
                title="Copy to PC clipboard"
              >
                Copy
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-dim italic text-center py-1">No clipboard content synced yet.</p>
          )}
        </div>
      )}

      {/* 2. Notifications Section Header */}
      <div className="px-6 py-4 flex items-center justify-between text-xs text-muted font-bold tracking-wider uppercase border-b border-border bg-primary/20">
        <div className="flex items-center space-x-1.5">
          <Bell size={12} />
          <span>Notifications ({notifications.filter(n => !n.dismissed).length})</span>
        </div>
      </div>

      {/* 3. Notifications List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/40">
        {notifications.filter(n => !n.dismissed).length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-dim space-y-2">
            <Bell size={36} className="opacity-30" />
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs px-4">All synced notifications will show up here in real time.</p>
          </div>
        ) : (
          notifications
            .filter((n) => !n.dismissed)
            .map((notif) => (
              <div
                key={notif.id}
                className="group p-4 flex space-x-3.5 hover:bg-hover border-l-2 border-transparent hover:border-accent transition-all duration-150 relative"
              >
                {/* App icon or default badge */}
                <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center flex-shrink-0 text-xs font-semibold text-secondary">
                  {notif.icon ? (
                    <img src={notif.icon} alt={notif.app} className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <span>{notif.app.charAt(0)}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold text-secondary truncate">{notif.app}</span>
                    <span className="text-[10px] text-dim">{formatTime(notif.timestamp)}</span>
                  </div>
                  <h4 className="text-xs font-semibold text-white mt-0.5 truncate">{notif.title}</h4>
                  <p className="text-xs text-secondary mt-0.5 line-clamp-2 leading-relaxed break-words">
                    {notif.message}
                  </p>

                  {/* Notification Actions */}
                  {notif.actions && notif.actions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2 select-none">
                      {notif.actions.map((action) => (
                        <div key={action.index} className="inline-block">
                          {replyingId === `${notif.id}-${action.index}` ? (
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault()
                                if (replyText.trim()) {
                                  await window.api.triggerNotificationAction(notif.id, action.index, replyText.trim())
                                  await window.api.dismissNotification(notif.id)
                                  onDismissNotification(notif.id)
                                  setReplyingId(null)
                                  setReplyText('')
                                }
                              }}
                              className="flex items-center space-x-1.5 no-drag bg-card border border-border/80 rounded px-2 py-0.5"
                            >
                              <input
                                type="text"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Reply..."
                                className="bg-transparent text-[10px] text-white focus:outline-none w-20"
                                autoFocus
                              />
                              <button
                                type="submit"
                                disabled={!replyText.trim()}
                                className="text-accent hover:text-white disabled:opacity-40"
                              >
                                <Send size={10} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setReplyingId(null)}
                                className="text-dim hover:text-white"
                              >
                                <X size={10} />
                              </button>
                            </form>
                          ) : (
                            <button
                              onClick={async () => {
                                if (action.isReply) {
                                  setReplyingId(`${notif.id}-${action.index}`)
                                  setReplyText('')
                                } else {
                                  await window.api.triggerNotificationAction(notif.id, action.index)
                                  await window.api.dismissNotification(notif.id)
                                  onDismissNotification(notif.id)
                                }
                              }}
                              className="px-2 py-1 bg-card hover:bg-hover border border-border/80 rounded text-[10px] font-bold text-secondary hover:text-white transition-all duration-150"
                            >
                              {action.title}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    replyingId === notif.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (replyText.trim()) {
                            onSendReply(notif.id, replyText.trim())
                            setReplyingId(null)
                            setReplyText('')
                          }
                        }}
                        className="mt-2.5 flex items-center space-x-2 no-drag"
                      >
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type reply..."
                          className="flex-1 bg-card border border-border rounded px-2.5 py-1 text-[11px] text-white focus:outline-none focus:border-accent"
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={!replyText.trim()}
                          className="p-1 bg-accent rounded text-white hover:bg-accent-dark disabled:opacity-40"
                        >
                          <Send size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setReplyingId(null)}
                          className="p-1 text-dim hover:text-white"
                        >
                          <X size={10} />
                        </button>
                      </form>
                    ) : (
                      notif.replyable === true && (
                        <button
                          onClick={() => {
                            setReplyingId(notif.id)
                            setReplyText('')
                          }}
                          className="mt-1.5 text-[10px] text-accent font-semibold hover:underline"
                        >
                          Reply
                        </button>
                      )
                    )
                  )}
                </div>

                {/* Dismiss Button (Visible on hover) */}
                <button
                  onClick={() => onDismissNotification(notif.id)}
                  className="absolute right-3 top-3 p-1 rounded hover:bg-card text-dim hover:text-white transition-opacity md:opacity-0 group-hover:opacity-100"
                  title="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
            ))
        )}
      </div>

    </aside>
  )
}
