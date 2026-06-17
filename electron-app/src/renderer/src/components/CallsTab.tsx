import React, { useState, useEffect } from 'react'
import { CallRecord, ContactRecord } from '../types'
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  Search,
  Phone,
  Clock,
  X,
  Delete
} from 'lucide-react'

interface CallsTabProps {
  calls: CallRecord[]
  contacts?: ContactRecord[]
}

export const CallsTab: React.FC<CallsTabProps> = ({ calls, contacts }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [dialNumber, setDialNumber] = useState('')

  // Filter calls by name or number
  const filteredCalls = calls.filter(
    (call) =>
      call.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.number.includes(searchQuery)
  )

  // Find contact matching dialNumber
  const matchedContact = contacts?.find(
    (c) => c.number.replace(/\D/g, '') === dialNumber.replace(/\D/g, '') && dialNumber.length > 0
  ) || contacts?.find(
    (c) => c.number.includes(dialNumber) && dialNumber.length >= 3
  )

  // Format call duration
  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return '0s'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) {
      return `${mins}m ${secs}s`
    }
    return `${secs}s`
  }

  // Format date/time
  const formatCallTime = (isoString: string) => {
    try {
      const date = new Date(isoString)
      const now = new Date()
      
      const isToday = date.toDateString() === now.toDateString()
      const yesterday = new Date(now)
      yesterday.setDate(now.getDate() - 1)
      const isYesterday = date.toDateString() === yesterday.toDateString()

      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

      if (isToday) {
        return `Today ${timeStr}`
      } else if (isYesterday) {
        return `Yesterday ${timeStr}`
      } else {
        return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeStr}`
      }
    } catch {
      return ''
    }
  }

  // Get call type icon & color classes
  const getCallTypeDetails = (type: CallRecord['callType']) => {
    switch (type) {
      case 'incoming':
        return {
          icon: <PhoneIncoming size={16} />,
          colorClass: 'text-success bg-success/10',
          label: 'Incoming'
        }
      case 'outgoing':
        return {
          icon: <PhoneOutgoing size={16} />,
          colorClass: 'text-accent bg-accent/10',
          label: 'Outgoing'
        }
      case 'missed':
        return {
          icon: <PhoneMissed size={16} />,
          colorClass: 'text-danger bg-danger/10',
          label: 'Missed'
        }
      case 'declined':
        return {
          icon: <PhoneOff size={16} />,
          colorClass: 'text-warning bg-warning/10',
          label: 'Declined'
        }
      default:
        return {
          icon: <PhoneIncoming size={16} />,
          colorClass: 'text-secondary bg-card',
          label: 'Unknown'
        }
    }
  }

  const handleCallback = async (number: string) => {
    try {
      const success = await window.api.dialNumber(number)
      if (!success) {
        alert('Failed to trigger call. Make sure phone is connected.')
      }
    } catch (err) {
      console.error('Failed to dial number:', err)
      alert('Error dialing number.')
    }
  }

  const handleKeyPress = (num: string) => {
    setDialNumber((prev) => prev + num)
  }

  const handleDelete = () => {
    setDialNumber((prev) => prev.slice(0, -1))
  }

  const handleClear = () => {
    setDialNumber('')
  }

  const handleDial = () => {
    if (dialNumber) {
      handleCallback(dialNumber)
    }
  }

  // Keyboard dialing listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return // Ignore keyboard dialing if focusing an input field
      }

      const key = e.key
      if (/[0-9*#+]/.test(key)) {
        setDialNumber((prev) => prev + key)
      } else if (key === 'Backspace') {
        setDialNumber((prev) => prev.slice(0, -1))
      } else if (key === 'Enter') {
        handleDial()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialNumber])

  return (
    <div className="flex-1 flex h-full bg-primary overflow-hidden">
      
      {/* Left Column: Recent Calls */}
      <div className="flex-1 flex flex-col border-r border-border h-full overflow-hidden">
        {/* Search Header */}
        <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Recent Calls</h2>
            <p className="text-xs text-muted mt-0.5">Syncs calls history from your mobile device</p>
          </div>
          
          {/* Search Bar */}
          <div className="relative w-72">
            <Search className="absolute left-3 top-2.5 text-dim" size={16} />
            <input
              type="text"
              placeholder="Search recent calls..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-accent placeholder:text-dim transition-colors"
            />
          </div>
        </div>

        {/* Calls List */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredCalls.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-dim space-y-3">
              <Phone size={48} className="opacity-20" />
              <p className="text-sm font-semibold">No call records found</p>
              <p className="text-xs max-w-sm px-6">
                {searchQuery ? 'Try adjusting your search criteria.' : 'Your call history will sync automatically once connected.'}
              </p>
            </div>
          ) : (
            <div className="bg-sidebar border border-border rounded-xl divide-y divide-border/50 overflow-hidden shadow-lg">
              {filteredCalls.map((call) => {
                const details = getCallTypeDetails(call.callType)
                const initials = (call.name || 'U').charAt(0).toUpperCase()

                return (
                  <div
                    key={call.id}
                    onClick={() => handleCallback(call.number)}
                    className="flex items-center justify-between p-4 hover:bg-hover transition-colors duration-150 cursor-pointer group"
                  >
                    <div className="flex items-center space-x-4">
                      {/* Caller Avatar */}
                      <div className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-sm font-bold text-accent group-hover:border-accent/50 transition-colors">
                        {initials}
                      </div>

                      {/* Contact Details */}
                      <div>
                        <h4 className="text-sm font-semibold text-white group-hover:text-accent transition-colors">
                          {call.name || call.number}
                        </h4>
                        <p className="text-xs text-muted mt-0.5">{call.number}</p>
                      </div>
                    </div>

                    {/* Call Meta Info */}
                    <div className="flex items-center space-x-6 text-xs text-secondary">
                      {/* Call Status Badge */}
                      <div className="flex items-center space-x-3">
                        <div className={`p-1.5 rounded-lg ${details.colorClass}`} title={details.label}>
                          {details.icon}
                        </div>
                        <div className="hidden sm:block min-w-[70px]">
                          <p className="font-semibold text-white">{details.label}</p>
                          {call.duration > 0 && (
                            <div className="flex items-center space-x-1 text-dim text-[10px] mt-0.5">
                              <Clock size={10} />
                              <span>{formatDuration(call.duration)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div className="text-right min-w-[110px]">
                        <span className="text-dim">{formatCallTime(call.timestamp)}</span>
                      </div>

                      {/* Actions */}
                      <div className="p-2 rounded-lg bg-card border border-border opacity-0 group-hover:opacity-100 transition-opacity">
                        <Phone size={14} className="text-accent" />
                      </div>
                    </div>

                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Dialer */}
      <div className="w-80 bg-sidebar flex flex-col h-full overflow-hidden select-none p-6">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-white tracking-wide">Dial Pad</h3>
          <p className="text-[10px] text-dim mt-0.5">Dial a number to call from PC</p>
        </div>

        {/* Dial Display */}
        <div className="bg-primary/40 border border-border/80 rounded-xl p-4 flex flex-col items-center justify-center min-h-[80px] relative mb-6">
          <div className="text-lg font-bold tracking-wider text-white text-center break-all px-6">
            {dialNumber || <span className="text-dim text-xs font-normal">Enter number...</span>}
          </div>
          {matchedContact && (
            <div className="text-[10px] text-accent mt-1.5 font-medium">
              {matchedContact.name}
            </div>
          )}
          {dialNumber && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-hover rounded text-dim hover:text-white transition-colors"
              title="Clear number"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Dial Keys Grid */}
        <div className="grid grid-cols-3 gap-2.5 mb-6">
          {[
            { num: '1', letters: '' },
            { num: '2', letters: 'ABC' },
            { num: '3', letters: 'DEF' },
            { num: '4', letters: 'GHI' },
            { num: '5', letters: 'JKL' },
            { num: '6', letters: 'MNO' },
            { num: '7', letters: 'PQRS' },
            { num: '8', letters: 'TUV' },
            { num: '9', letters: 'WXYZ' },
            { num: '*', letters: '' },
            { num: '0', letters: '+' },
            { num: '#' },
          ].map((key) => (
            <button
              key={key.num}
              onClick={() => handleKeyPress(key.num)}
              className="flex flex-col items-center justify-center bg-card border border-border hover:border-accent/40 rounded-xl py-2 transition-all duration-150 hover:bg-hover active:scale-95 group"
            >
              <span className="text-base font-bold text-white group-hover:text-accent transition-colors">
                {key.num}
              </span>
              <span className="text-[7px] text-dim font-bold tracking-wider mt-0.5 group-hover:text-secondary transition-colors">
                {key.letters || '\u00A0'}
              </span>
            </button>
          ))}
        </div>

        {/* Action Keys */}
        <div className="flex items-center justify-center space-x-6">
          {dialNumber && (
            <button
              onClick={handleDelete}
              className="p-3 bg-card border border-border text-dim hover:text-white hover:bg-hover rounded-full transition-all flex items-center justify-center"
              title="Backspace"
            >
              <Delete size={16} />
            </button>
          )}
          <button
            onClick={handleDial}
            disabled={!dialNumber}
            className="w-12 h-12 bg-success hover:bg-success/80 text-white rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 disabled:cursor-not-allowed"
            title="Call"
          >
            <Phone size={20} />
          </button>
        </div>
      </div>

    </div>
  )
}
