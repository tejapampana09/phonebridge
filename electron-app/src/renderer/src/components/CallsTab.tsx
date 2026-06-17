import React, { useState } from 'react'
import { CallRecord } from '../types'
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  Search,
  Phone,
  Clock
} from 'lucide-react'

interface CallsTabProps {
  calls: CallRecord[]
}

export const CallsTab: React.FC<CallsTabProps> = ({ calls }) => {
  const [searchQuery, setSearchQuery] = useState('')

  // Filter calls by name or number
  const filteredCalls = calls.filter(
    (call) =>
      call.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.number.includes(searchQuery)
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

  const handleCallback = async (call: CallRecord) => {
    try {
      const success = await window.api.dialNumber(call.number)
      if (!success) {
        alert('Failed to trigger call. Make sure phone is connected.')
      }
    } catch (err) {
      console.error('Failed to dial number:', err)
      alert('Error dialing number.')
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-primary overflow-hidden">
      
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
                  onClick={() => handleCallback(call)}
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
  )
}
