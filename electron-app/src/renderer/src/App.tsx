import { useState, useEffect } from 'react'
import { useDatabase } from './hooks/useDatabase'
import { PairingScreen } from './components/PairingScreen'
import { Sidebar } from './components/Sidebar'
import { CallsTab } from './components/CallsTab'
import { MessagesTab } from './components/MessagesTab'
import { PhotosTab } from './components/PhotosTab'
import { AppsTab } from './components/AppsTab'
import { ContactsTab } from './components/ContactsTab'
import { FilesTab } from './components/FilesTab'
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
  User,
  FileUp,
  Settings,
  Calendar as CalendarIcon
} from 'lucide-react'
import { CalendarTab } from './components/CalendarTab'
import { MirroringModal } from './components/MirroringModal'

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('calls')
  const [isPaired, setIsPaired] = useState(false)
  const [incomingCall, setIncomingCall] = useState<{ name: string; number: string } | null>(null)
  const [activeCall, setActiveCall] = useState<{ name: string; number: string; status: 'dialing' | 'active' } | null>(null)
  const [callDuration, setCallDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [audioDevices, setAudioDevices] = useState<any[]>([])

  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showMirroring, setShowMirroring] = useState(false)
  const [openAtLogin, setOpenAtLogin] = useState(false)
  const [isHfpConnected, setIsHfpConnected] = useState(false)
  const [callingStatus, setCallingStatus] = useState<any>(null)

  const [prefMic, setPrefMic] = useState('auto')
  const [prefSpeaker, setPrefSpeaker] = useState('auto')
  const [prefPhoneIn, setPrefPhoneIn] = useState('auto')
  const [prefPhoneOut, setPrefPhoneOut] = useState('auto')

  const fetchCallingStatus = async () => {
    try {
      const status = await window.api.getCallingStatus()
      setCallingStatus(status)
      if (status) {
        setIsHfpConnected(!!(status.connectedPhone?.hfpVerified && status.audioDevices?.phoneInput && status.audioDevices?.phoneOutput))
      }
      const devices = await window.api.getAudioDevices()
      setAudioDevices(devices)
    } catch (err) {
      console.error('Failed to query calling status or audio devices:', err)
    }
  }

  useEffect(() => {
    fetchCallingStatus()
    const interval = setInterval(fetchCallingStatus, 4000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const s = await window.api.getSettings()
        setOpenAtLogin(s.openAtLogin ?? false)
        setPrefMic(s.phonePrefMic ?? 'auto')
        setPrefSpeaker(s.phonePrefSpeaker ?? 'auto')
        setPrefPhoneIn(s.phonePrefPhoneIn ?? 'auto')
        setPrefPhoneOut(s.phonePrefPhoneOut ?? 'auto')
      } catch (err) {
        console.error('Failed to load settings:', err)
      }
    }
    loadSettings()
  }, [])

  // Call Active Timer
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (activeCall?.status === 'active') {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1)
      }, 1000)
    } else {
      setCallDuration(0)
    }
    return () => clearInterval(timer)
  }, [activeCall])

  const formatCallDuration = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0')
    const s = (sec % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const toggleMute = async () => {
    const nextMute = !isMuted
    setIsMuted(nextMute)
    await window.api.setCallMute(nextMute)
  }

  const {
    notifications,
    calls,
    smsThreads,
    photos,
    deviceStatus,
    contacts,
    apps,
    calendarEvents,
    refreshAll,
    fetchDeviceStatus,
    fetchNotifications,
    fetchCalls,
    fetchSmsThreads,
    fetchCalendarEvents,
    fetchContacts
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

  // Listen to phone events for incoming call modal and active call HUD
  useEffect(() => {
    const handlePhoneEvents = (_event: any, payload: any) => {
      const { type, data } = payload
      
      if (type === 'CALL_INCOMING') {
        setIncomingCall({
          name: data.name || 'Unknown',
          number: data.number || 'Unknown'
        })
      } else if (type === 'CALL_UPDATE') {
        const { status, number, name } = data
        if (status === 'dialing') {
          setActiveCall({
            name: name || 'Unknown',
            number: number || 'Unknown',
            status: 'dialing'
          })
          setIncomingCall(null)
        } else if (status === 'answered') {
          setActiveCall(prev => ({
            name: prev?.name || name || 'Unknown',
            number: prev?.number || number || 'Unknown',
            status: 'active'
          }))
          setIncomingCall(null)
        } else if (status === 'ended' || status === 'declined') {
          setActiveCall(null)
          setIncomingCall(null)
          setIsMuted(false)
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

  const handleAnswerCall = async () => {
    try {
      const success = await window.api.answerCall()
      if (!success) {
        console.warn('Failed to answer call via PC.')
      }
    } catch (err) {
      console.error('Failed to answer call:', err)
    }
    setIncomingCall(null)
  }

  const handleDeclineCall = async () => {
    try {
      const success = await window.api.rejectCall()
      if (!success) {
        console.warn('Failed to decline call via PC.')
      }
    } catch (err) {
      console.error('Failed to decline call:', err)
    }
    setIncomingCall(null)
  }

  const handleUnpair = async () => {
    if (confirm('Are you sure you want to disconnect and unpair your mobile device?')) {
      try {
        await window.api.unlinkDevice()
      } catch (err) {
        console.error('Failed to unlink device:', err)
      }
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
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
              deviceStatus?.connected
                ? 'bg-success/15 text-success border-success/20'
                : 'bg-warning/15 text-warning border-warning/20'
            }`}>
              {deviceStatus?.connected
                ? deviceStatus.btConnected
                  ? 'Linked via Bluetooth'
                  : 'Linked via Local WiFi'
                : 'Connecting...'}
            </span>
          )}
        </div>

        {/* Window controls */}
        <div className="no-drag flex items-center h-full space-x-1">
          {isPaired && (
            <button
              onClick={() => setShowSettingsModal(true)}
              className="h-10 w-11 flex items-center justify-center hover:bg-hover transition-colors text-dim hover:text-white"
              title="Settings"
            >
              <Settings size={14} />
            </button>
          )}
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
            onOpenMirroring={() => setShowMirroring(true)}
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
                  onClick={() => setActiveTab('contacts')}
                  className={`flex items-center space-x-2 border-b-2 px-1 text-sm font-semibold transition-all h-full ${
                    activeTab === 'contacts'
                      ? 'border-accent text-accent'
                      : 'border-transparent text-secondary hover:text-white'
                  }`}
                >
                  <User size={14} />
                  <span>Contacts</span>
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
                  <span>Apps</span>
                </button>
                <button
                  onClick={() => setActiveTab('files')}
                  className={`flex items-center space-x-2 border-b-2 px-1 text-sm font-semibold transition-all h-full ${
                    activeTab === 'files'
                      ? 'border-accent text-accent'
                      : 'border-transparent text-secondary hover:text-white'
                  }`}
                >
                  <FileUp size={14} />
                  <span>Files</span>
                </button>
                <button
                  onClick={() => setActiveTab('calendar')}
                  className={`flex items-center space-x-2 border-b-2 px-1 text-sm font-semibold transition-all h-full ${
                    activeTab === 'calendar'
                      ? 'border-accent text-accent'
                      : 'border-transparent text-secondary hover:text-white'
                  }`}
                >
                  <CalendarIcon size={14} />
                  <span>Calendar</span>
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
              {activeTab === 'calls' && <CallsTab calls={calls} contacts={contacts} />}
              {activeTab === 'contacts' && <ContactsTab contacts={contacts} onRefreshContacts={fetchContacts} />}
              {activeTab === 'messages' && (
                <MessagesTab threads={smsThreads} refreshThreads={fetchSmsThreads} />
              )}
              {activeTab === 'photos' && <PhotosTab photos={photos} />}
              {activeTab === 'apps' && <AppsTab apps={apps} />}
              {activeTab === 'files' && <FilesTab />}
              {activeTab === 'calendar' && (
                <CalendarTab
                  calendarEvents={calendarEvents}
                  refreshEvents={fetchCalendarEvents}
                  deviceConnected={deviceStatus?.connected || false}
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

      {/* 4. Settings Modal Overlay */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-sidebar border border-border w-full max-w-md rounded-2xl shadow-2xl p-6 relative animate-fade-in">
            <button
              onClick={() => setShowSettingsModal(false)}
              className="absolute top-4 right-4 p-1 rounded hover:bg-hover text-dim hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
            
            <div className="flex items-center space-x-3 mb-6">
              <Settings className="text-accent animate-spin-slow" size={20} />
              <h2 className="text-base font-bold text-white">PhoneBridge Settings</h2>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between p-3.5 bg-primary/30 border border-border/60 rounded-xl">
                <div>
                  <h4 className="text-xs font-bold text-white">Launch at startup</h4>
                  <p className="text-[10px] text-dim mt-0.5">Start PhoneBridge automatically when Windows starts.</p>
                </div>
                <input
                  type="checkbox"
                  checked={openAtLogin}
                  onChange={async (e) => {
                    const newVal = e.target.checked
                    setOpenAtLogin(newVal)
                    try {
                      await window.api.setSetting('openAtLogin', newVal)
                    } catch (err) {
                      console.error('Failed to update startup setting:', err)
                    }
                  }}
                  className="w-4 h-4 rounded text-accent focus:ring-accent accent-accent cursor-pointer"
                />
              </div>

              {/* Call Audio Settings */}
              <div className="flex flex-col p-3.5 bg-primary/30 border border-border/60 rounded-xl space-y-3 max-h-[300px] overflow-y-auto">
                <div>
                  <h4 className="text-xs font-bold text-white">Call Audio Setup (Bluetooth)</h4>
                  <p className="text-[10px] text-dim mt-0.5">
                    Select preferred audio input/output devices for PhoneBridge voice calls.
                  </p>
                </div>
                
                <div className="flex items-center justify-between text-[10px] bg-card p-2 rounded-lg border border-border/60">
                  <span className="text-secondary font-medium">HFP Call Audio Device Status:</span>
                  <span className={`font-bold ${isHfpConnected ? 'text-success' : 'text-warning'}`}>
                    {isHfpConnected ? 'Connected & Ready' : 'Not Connected'}
                  </span>
                </div>

                {/* 6-step setup checklist */}
                <div className="flex flex-col space-y-1.5 pt-2 border-t border-border/40">
                  <label className="text-[9px] font-bold text-secondary uppercase tracking-wider">Calling Setup Wizard</label>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex items-center justify-between p-1.5 bg-card/50 rounded border border-border/40">
                      <span className="text-dim">Step 1: WiFi Link Connected</span>
                      <span className={deviceStatus?.connected ? "text-success font-bold" : "text-danger font-bold"}>
                        {deviceStatus?.connected ? "✓ Pass" : "✗ Fail"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-card/50 rounded border border-border/40">
                      <span className="text-dim">Step 2: Android Permissions Granted</span>
                      <span className={deviceStatus?.connected ? "text-success font-bold" : "text-danger font-bold"}>
                        {deviceStatus?.connected ? "✓ Pass" : "✗ Fail"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-card/50 rounded border border-border/40">
                      <span className="text-dim">Step 3: Bluetooth Paired</span>
                      <span className={callingStatus?.pairedDevices?.length > 0 ? "text-success font-bold" : "text-danger font-bold"}>
                        {callingStatus?.pairedDevices?.length > 0 ? "✓ Pass" : "✗ Fail"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-card/50 rounded border border-border/40">
                      <span className="text-dim">Step 4: HFP Connection Verified</span>
                      <span className={callingStatus?.connectedPhone?.hfpVerified ? "text-success font-bold" : "text-danger font-bold"}>
                        {callingStatus?.connectedPhone?.hfpVerified ? "✓ Pass" : "✗ Fail"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-card/50 rounded border border-border/40">
                      <span className="text-dim">Step 5: Hands-Free Audio Endpoints Active</span>
                      <span className={(callingStatus?.audioDevices?.phoneInput && callingStatus?.audioDevices?.phoneOutput) ? "text-success font-bold" : "text-danger font-bold"}>
                        {(callingStatus?.audioDevices?.phoneInput && callingStatus?.audioDevices?.phoneOutput) ? "✓ Pass" : "✗ Fail"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-card/50 rounded border border-border/40">
                      <span className="text-dim">Step 6: Calling System Ready</span>
                      <span className={isHfpConnected ? "text-success font-bold" : "text-warning font-bold"}>
                        {isHfpConnected ? "✓ Ready" : "• Waiting..."}
                      </span>
                    </div>
                  </div>
                  {(!callingStatus?.pairedDevices?.length || !callingStatus?.connectedPhone?.hfpVerified) && (
                    <button
                      onClick={async () => {
                        try {
                          await window.api.startPairing()
                        } catch (err) {
                          console.error(err)
                        }
                      }}
                      className="w-full text-center py-2 bg-accent hover:bg-accent/80 text-white font-bold rounded-lg text-[10px] transition-all shadow-md mt-1"
                    >
                      Pair / Connect Phone via Bluetooth
                    </button>
                  )}
                </div>

                {/* PC Microphone Select */}
                <div className="flex flex-col space-y-1">
                  <label className="text-[9px] font-bold text-secondary uppercase tracking-wider">PC Microphone</label>
                  <select
                    value={prefMic}
                    onChange={async (e) => {
                      const val = e.target.value
                      setPrefMic(val)
                      await window.api.setSetting('phonePrefMic', val)
                    }}
                    className="w-full bg-card border border-border/60 text-xs text-white rounded-lg p-2 outline-none focus:border-accent"
                  >
                    <option value="auto">Auto-detect Default</option>
                    {audioDevices.filter(d => d.max_input_channels > 0 && !d.name.toLowerCase().includes('hands-free') && !d.name.toLowerCase().includes('hfp') && !d.name.toLowerCase().includes('bthhfenum')).map(d => (
                      <option key={d.index} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* PC Speaker Select */}
                <div className="flex flex-col space-y-1">
                  <label className="text-[9px] font-bold text-secondary uppercase tracking-wider">PC Speakers / Headphones</label>
                  <select
                    value={prefSpeaker}
                    onChange={async (e) => {
                      const val = e.target.value
                      setPrefSpeaker(val)
                      await window.api.setSetting('phonePrefSpeaker', val)
                    }}
                    className="w-full bg-card border border-border/60 text-xs text-white rounded-lg p-2 outline-none focus:border-accent"
                  >
                    <option value="auto">Auto-detect Default</option>
                    {audioDevices.filter(d => d.max_output_channels > 0 && !d.name.toLowerCase().includes('hands-free') && !d.name.toLowerCase().includes('hfp') && !d.name.toLowerCase().includes('bthhfenum')).map(d => (
                      <option key={d.index} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* Phone HFP Input Device Select */}
                <div className="flex flex-col space-y-1">
                  <label className="text-[9px] font-bold text-secondary uppercase tracking-wider">Phone Bluetooth Input (HFP)</label>
                  <select
                    value={prefPhoneIn}
                    onChange={async (e) => {
                      const val = e.target.value
                      setPrefPhoneIn(val)
                      await window.api.setSetting('phonePrefPhoneIn', val)
                    }}
                    className="w-full bg-card border border-border/60 text-xs text-white rounded-lg p-2 outline-none focus:border-accent"
                  >
                    <option value="auto">Auto-detect (Recommended)</option>
                    {audioDevices.filter(d => d.max_input_channels > 0 && (d.name.toLowerCase().includes('hands-free') || d.name.toLowerCase().includes('handsfree') || d.name.toLowerCase().includes('bthhfenum'))).map(d => (
                      <option key={d.index} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* Phone HFP Output Device Select */}
                <div className="flex flex-col space-y-1">
                  <label className="text-[9px] font-bold text-secondary uppercase tracking-wider">Phone Bluetooth Output (HFP)</label>
                  <select
                    value={prefPhoneOut}
                    onChange={async (e) => {
                      const val = e.target.value
                      setPrefPhoneOut(val)
                      await window.api.setSetting('phonePrefPhoneOut', val)
                    }}
                    className="w-full bg-card border border-border/60 text-xs text-white rounded-lg p-2 outline-none focus:border-accent"
                  >
                    <option value="auto">Auto-detect (Recommended)</option>
                    {audioDevices.filter(d => d.max_output_channels > 0 && (d.name.toLowerCase().includes('hands-free') || d.name.toLowerCase().includes('handsfree') || d.name.toLowerCase().includes('bthhfenum'))).map(d => (
                      <option key={d.index} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => {
                    alert(
                      "To route phone call audio through your PC:\n\n" +
                      "1. Open Windows Settings -> Bluetooth & devices.\n" +
                      "2. Click 'Add device' and pair your Android phone via Bluetooth.\n" +
                      "3. Once paired, click the three dots next to your phone, select 'Properties' (or 'More Bluetooth settings'), and ensure 'Handsfree telephony' (HFP) service is enabled.\n" +
                      "4. Your phone call audio and microphone will then automatically route through your default PC speaker & mic."
                    )
                  }}
                  className="w-full text-center py-2 bg-card border border-border hover:bg-hover text-accent font-bold rounded-lg text-[10px] transition-all"
                >
                  View Bluetooth Call Setup Guide
                </button>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-primary/30 border border-border/60 rounded-xl">
                <div>
                  <h4 className="text-xs font-bold text-white">App Version</h4>
                  <p className="text-[10px] text-dim mt-0.5">Version 1.0.0 (Latest)</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const res = await window.api.checkForUpdates()
                      if (res && res.success) {
                        alert(`You are running the latest version (v${res.version}).`)
                      } else {
                        alert('Failed to check for updates.')
                      }
                    } catch {
                      alert('Failed to check for updates.')
                    }
                  }}
                  className="px-3 py-1.5 bg-card border border-border hover:bg-hover text-secondary hover:text-white rounded-lg text-[10px] font-bold transition-all"
                >
                  Check Updates
                </button>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg text-xs font-bold shadow-md transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 5. Screen Mirroring Modal Overlay */}
      {showMirroring && (
        <MirroringModal onClose={() => setShowMirroring(false)} />
      )}

      {/* 6. Active Call Floating HUD */}
      {activeCall && (
        <div className="fixed bottom-6 right-6 w-80 bg-sidebar border border-accent/30 rounded-2xl shadow-2xl p-4 z-40 animate-fade-in flex flex-col space-y-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-accent">
                {activeCall.status === 'dialing' ? 'Calling...' : 'Active Call'}
              </span>
            </div>
            {activeCall.status === 'active' && (
              <span className="text-[10px] font-mono text-secondary bg-card px-2 py-0.5 rounded border border-border">
                {formatCallDuration(callDuration)}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center font-bold text-accent">
              {(activeCall.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-white truncate">{activeCall.name}</h4>
              <p className="text-[10px] text-dim truncate mt-0.5">{activeCall.number}</p>
            </div>
          </div>

          {/* Quick Audio Routing Selectors */}
          <div className="space-y-1.5 text-[10px] bg-primary/40 p-2 rounded-xl border border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-dim">Mic:</span>
              <select
                value={prefMic}
                onChange={async (e) => {
                  const val = e.target.value
                  setPrefMic(val)
                  await window.api.setSetting('phonePrefMic', val)
                  // Restart loopback dynamically
                  if (activeCall.status === 'active' || activeCall.status === 'dialing') {
                    await window.api.startCallAudio({ phoneInput: prefPhoneIn, phoneOutput: prefPhoneOut, pcInput: val, pcOutput: prefSpeaker })
                  }
                }}
                className="bg-card border border-border/60 text-white rounded px-1.5 py-0.5 max-w-[150px] outline-none"
              >
                <option value="auto">Auto-detect</option>
                {audioDevices.filter(d => d.max_input_channels > 0 && !d.name.toLowerCase().includes('hands-free') && !d.name.toLowerCase().includes('hfp') && !d.name.toLowerCase().includes('bthhfenum')).map(d => (
                  <option key={d.index} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-dim">Speaker:</span>
              <select
                value={prefSpeaker}
                onChange={async (e) => {
                  const val = e.target.value
                  setPrefSpeaker(val)
                  await window.api.setSetting('phonePrefSpeaker', val)
                  // Restart loopback dynamically
                  if (activeCall.status === 'active' || activeCall.status === 'dialing') {
                    await window.api.startCallAudio({ phoneInput: prefPhoneIn, phoneOutput: prefPhoneOut, pcInput: prefMic, pcOutput: val })
                  }
                }}
                className="bg-card border border-border/60 text-white rounded px-1.5 py-0.5 max-w-[150px] outline-none"
              >
                <option value="auto">Auto-detect</option>
                {audioDevices.filter(d => d.max_output_channels > 0 && !d.name.toLowerCase().includes('hands-free') && !d.name.toLowerCase().includes('hfp') && !d.name.toLowerCase().includes('bthhfenum')).map(d => (
                  <option key={d.index} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-4 pt-1">
            {/* Mute Button */}
            <button
              onClick={toggleMute}
              className={`p-2.5 rounded-full border transition-all ${
                isMuted
                  ? 'bg-warning/20 border-warning text-warning'
                  : 'bg-card border-border hover:bg-hover text-dim hover:text-white'
              }`}
              title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              <Minus size={16} />
            </button>

            {/* Hang Up Button */}
            <button
              onClick={async () => {
                try {
                  await window.api.rejectCall()
                } catch (err) {
                  console.error(err)
                }
                setActiveCall(null)
                setCallDuration(0)
              }}
              className="p-2.5 bg-danger hover:bg-danger/80 text-white rounded-full transition-all flex items-center justify-center shadow-lg shadow-danger/25"
              title="Hang Up"
            >
              <Phone size={16} className="rotate-[135deg]" />
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

export default App
