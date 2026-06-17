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
  Send
} from 'lucide-react'

interface SidebarProps {
  deviceStatus: DeviceStatus | null
  notifications: PhoneNotification[]
  onDismissNotification: (id: string) => void
  onRequestSync: () => void
  onSendReply: (id: string, message: string) => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  deviceStatus,
  notifications,
  onDismissNotification,
  onRequestSync,
  onSendReply
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
                {isConnected ? 'Linked via local sync' : 'Offline'}
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

        {/* Status Bar Indicators (Battery, WiFi, Signal) */}
        {isConnected && (
          <div className="grid grid-cols-3 gap-2 bg-primary/40 p-2.5 rounded-lg border border-border/60 text-xs">
            
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
        )}

      </div>

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

                  {/* Inline Quick Reply UI */}
                  {replyingId === notif.id ? (
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
                    <button
                      onClick={() => {
                        setReplyingId(notif.id)
                        setReplyText('')
                      }}
                      className="mt-1.5 text-[10px] text-accent font-semibold hover:underline"
                    >
                      Reply
                    </button>
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
