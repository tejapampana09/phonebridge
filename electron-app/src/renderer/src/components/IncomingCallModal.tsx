import React from 'react'
import { Phone, PhoneOff } from 'lucide-react'

interface IncomingCallModalProps {
  callerName: string
  callerNumber: string
  onAnswer: () => void
  onDecline: () => void
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  callerName,
  callerNumber,
  onAnswer,
  onDecline
}) => {
  const initials = (callerName || 'U').charAt(0).toUpperCase()

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in select-none">
      <div className="max-w-md w-full bg-sidebar border border-border rounded-2xl p-8 flex flex-col items-center text-center space-y-8 shadow-2xl relative overflow-hidden">
        
        {/* Ambient Ringing Pulse Indicator */}
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-accent/10 rounded-full blur-2xl animate-pulse" />
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-accent/10 rounded-full blur-2xl animate-pulse" />

        {/* Ringing Label */}
        <div className="flex flex-col items-center space-y-2">
          <span className="text-[10px] uppercase font-bold tracking-widest text-accent animate-pulse">
            Incoming Call
          </span>
          <div className="h-1 w-12 bg-accent rounded-full animate-pulse" />
        </div>

        {/* Caller Avatar */}
        <div className="relative flex items-center justify-center">
          {/* Animated Pulsing Rings */}
          <div className="absolute inset-0 rounded-full border border-accent/30 animate-ping scale-125 opacity-75" />
          <div className="absolute inset-0 rounded-full border border-accent/20 animate-ping scale-150 opacity-40" />
          
          <div className="w-24 h-24 rounded-full bg-card border-2 border-accent flex items-center justify-center text-3xl font-bold text-accent shadow-xl relative z-10">
            {initials}
          </div>
        </div>

        {/* Caller Details */}
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white">{callerName || 'Unknown Caller'}</h2>
          <p className="text-sm text-secondary font-medium">{callerNumber}</p>
        </div>

        {/* Call Action Buttons */}
        <div className="flex items-center justify-center space-x-8 w-full pt-4 relative z-10">
          
          {/* Decline Button (Red) */}
          <button
            onClick={onDecline}
            className="flex flex-col items-center space-y-2 group"
          >
            <div className="w-14 h-14 bg-danger hover:bg-danger/90 rounded-full flex items-center justify-center text-white shadow-lg shadow-danger/20 transition-all duration-150 transform hover:scale-105 active:scale-95">
              <PhoneOff size={24} />
            </div>
            <span className="text-xs text-dim group-hover:text-secondary font-medium transition-colors">
              Decline
            </span>
          </button>

          {/* Answer Button (Green) */}
          <button
            onClick={onAnswer}
            className="flex flex-col items-center space-y-2 group"
          >
            <div className="w-14 h-14 bg-success hover:bg-success/90 rounded-full flex items-center justify-center text-white shadow-lg shadow-success/20 transition-all duration-150 transform hover:scale-105 active:scale-95">
              <Phone size={24} className="animate-bounce" />
            </div>
            <span className="text-xs text-dim group-hover:text-secondary font-medium transition-colors">
              Answer
            </span>
          </button>

        </div>

      </div>
    </div>
  )
}
