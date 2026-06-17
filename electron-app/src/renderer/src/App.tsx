import { useState, useEffect } from 'react'
import { useDatabase } from './hooks/useDatabase'
import { PairingScreen } from './components/PairingScreen'
import { Sidebar } from './components/Sidebar'
import { CallsTab } from './components/CallsTab'
import { MessagesTab } from './components/MessagesTab'
import { PhotosTab } from './components/PhotosTab'
import { AppsTab } from './components/AppsTab'
import { IncomingCallModal } from './components/IncomingCallModal'
import { TabId } from './types'
import {
  Phone,
  MessageSquare,
  Image as ImageIcon,
  AppWindow,
  Minus,
  Square,
  X,
  Link,
  Settings
} from 'lucide-react'

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('calls')
  const [isPaired, setIsPaired] = useState(false)
  const [incomingCall, setIncomingCall] = useState<{ name: string; number: string } | null>(null)

  const {
    notifications,
    calls,
    smsThreads,
    photos,
    deviceStatus,
    refreshAll,
    fetchDeviceStatus,
    fetchNotifications,
    fetchCalls,
    fetchSmsThreads
  } = useDatabase()

  const checkConnection = async () => {
    try {
      const conn = await window.api.getConnectionStatus()
      if (conn.wsConnected || conn.btConnected) {
        setIsPaired(true)
      }
    } catch (err) {
      console.error('Failed to get connection status:', err)
    }
  }

  useEffect(() => {
    checkConnection()

    // Periodically query connection status
    const interval = setInterval(() => {
      checkConnection()
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  // Listen to phone events for incoming call modal
  useEffect(() => {
    const handlePhoneEvents = (_event: any, payload: any) => {
      const { type, data } = payload
      
      if (type === 'CALL_INCOMING') {
        setIncomingCall({
          name: data.name || 'Unknown',
          number: data.number || 'Unknown'
        })
      } else if (type === 'CALL_UPDATE') {
        const { status } = data
        if (status === 'ended' || status === 'declined') {
          setIncomingCall(null)
        }
      }
    }

    const sub = window.api.onPhoneEvent(handlePhoneEvents)
    return () => {
      window.api.removePhoneEventListener(sub)
    }
  }, [])

  const handleDismissNotification = async (id: string) => {
    try {
      await window.api.dismissNotification(id)
      fetchNotifications()
    } catch (err) {
      console.error('Failed to dismiss notification:', err)
    }
  }

  const handleSendReply = async (id: string, message: string) => {
    try {
      const success = await window.api.replyNotification(id, message)
      if (success) {
        // Dismiss the notification locally after sending a reply
        await window.api.dismissNotification(id)
        fetchNotifications()
      } else {
        alert('Failed to send reply. This app might not support replies.')
      }
    } catch (err) {
      console.error('Failed to reply to notification:', err)
      alert('Error sending reply.')
    }
  }

  const handleRequestSync = async () => {
    try {
      await window.api.requestSync()
      refreshAll()
    } catch (err) {
      console.error('Failed to trigger sync:', err)
    }
  }

  const handleAnswerCall = () => {
    alert('Answering call... Please talk using your mobile handset.')
    setIncomingCall(null)
  }

  const handleDeclineCall = async () => {
    try {
      // Send dismiss command to phone
      if (incomingCall) {
        await window.api.dismissNotification(incomingCall.number)
      }
      setIncomingCall(null)
    } catch (err) {
      console.error('Failed to decline call:', err)
      setIncomingCall(null)
    }
  }

  const handleUnpair = () => {
    if (confirm('Are you sure you want to disconnect and unpair your mobile device?')) {
      setIsPaired(false)
      // Refresh local DB after unpairing
      refreshAll()
    }
  }

  // Minimize window
  const minimizeWindow = () => window.api.minimize()
  // Maximize window
  const maximizeWindow = () => window.api.maximize()
  // Close window (minimizes to system tray)
  const closeWindow = () => window.api.close()

  return (
    <div className="flex flex-col h-screen bg-primary overflow-hidden text-white border border-border">
      
      {/* 1. Custom Titlebar for Frameless Window */}
      <header className="titlebar h-10 bg-sidebar border-b border-border flex items-center justify-between px-4 flex-shrink-0 select-none">
        
        {/* App Title & Status */}
        <div className="flex items-center space-x-2">
          <Link size={14} className="text-accent animate-pulse" />
          <span className="text-xs font-semibold tracking-wide text-white">PhoneBridge</span>
          {isPaired && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success font-medium border border-success/20">
              Linked
            </span>
          )}
        </div>

        {/* Window controls */}
        <div className="no-drag flex items-center h-full">
          <button
            onClick={minimizeWindow}
            className="h-10 w-11 flex items-center justify-center hover:bg-hover transition-colors"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={maximizeWindow}
            className="h-10 w-11 flex items-center justify-center hover:bg-hover transition-colors"
            title="Maximize"
          >
            <Square size={10} />
          </button>
          <button
            onClick={closeWindow}
            className="h-10 w-11 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/* 2. Main Body (Pairing Screen vs Link Dashboard) */}
      {!isPaired ? (
        <PairingScreen onCheckStatus={checkConnection} />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          
          {/* Sidebar (Left) */}
          <Sidebar
            deviceStatus={deviceStatus}
            notifications={notifications}
            onDismissNotification={handleDismissNotification}
            onRequestSync={handleRequestSync}
            onSendReply={handleSendReply}
          />

          {/* Right Work Pane */}
          <main className="flex-1 flex flex-col h-full bg-primary overflow-hidden">
            
            {/* Top Navigation Tabs */}
            <nav className="h-14 border-b border-border bg-sidebar/55 flex items-center justify-between px-6 flex-shrink-0">
              
              {/* Tab options */}
              <div className="flex space-x-6 h-full">
                <button
                  onClick={() => setActiveTab('calls')}
                  className={`flex items-center space-x-2 border-b-2 px-1 text-sm font-semibold transition-all h-full ${
                    activeTab === 'calls'
                      ? 'border-accent text-accent'
                      : 'border-transparent text-secondary hover:text-white'
                  }`}
                >
                  <Phone size={14} />
                  <span>Calls</span>
                </button>
                <button
                  onClick={() => setActiveTab('messages')}
                  className={`flex items-center space-x-2 border-b-2 px-1 text-sm font-semibold transition-all h-full ${
                    activeTab === 'messages'
                      ? 'border-accent text-accent'
                      : 'border-transparent text-secondary hover:text-white'
                  }`}
                >
                  <MessageSquare size={14} />
                  <span>Messages</span>
                </button>
                <button
                  onClick={() => setActiveTab('photos')}
                  className={`flex items-center space-x-2 border-b-2 px-1 text-sm font-semibold transition-all h-full ${
                    activeTab === 'photos'
                      ? 'border-accent text-accent'
                      : 'border-transparent text-secondary hover:text-white'
                  }`}
                >
                  <ImageIcon size={14} />
                  <span>Photos</span>
                </button>
                <button
                  onClick={() => setActiveTab('apps')}
                  className={`flex items-center space-x-2 border-b-2 px-1 text-sm font-semibold transition-all h-full ${
                    activeTab === 'apps'
                      ? 'border-accent text-accent'
                      : 'border-transparent text-secondary hover:text-white'
                  }`}
                >
                  <AppWindow size={14} />
                  <span>App Alerts</span>
                </button>
              </div>

              {/* Utility Tools */}
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleUnpair}
                  className="flex items-center space-x-1.5 text-xs text-dim hover:text-danger font-semibold border border-border bg-card hover:bg-hover px-3 py-1.5 rounded-lg transition-all"
                  title="Disconnect Link"
                >
                  <X size={12} />
                  <span>Unlink Phone</span>
                </button>
              </div>

            </nav>

            {/* Active Tab Viewport */}
            <div className="flex-1 overflow-hidden relative">
              {activeTab === 'calls' && <CallsTab calls={calls} />}
              {activeTab === 'messages' && (
                <MessagesTab threads={smsThreads} refreshThreads={fetchSmsThreads} />
              )}
              {activeTab === 'photos' && <PhotosTab photos={photos} />}
              {activeTab === 'apps' && (
                <AppsTab
                  notifications={notifications}
                  onDismissNotification={handleDismissNotification}
                />
              )}
            </div>

          </main>
        </div>
      )}

      {/* 3. Incoming Call Modal Overlay */}
      {incomingCall && (
        <IncomingCallModal
          callerName={incomingCall.name}
          callerNumber={incomingCall.number}
          onAnswer={handleAnswerCall}
          onDecline={handleDeclineCall}
        />
      )}

    </div>
  )
}

export default App
