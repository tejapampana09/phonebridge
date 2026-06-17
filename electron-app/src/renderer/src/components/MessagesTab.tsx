import React, { useState, useEffect, useRef, useCallback } from 'react'
import { SmsThread, SmsMessage } from '../types'
import { MessageSquare, Send, Search, User, Loader2 } from 'lucide-react'

interface MessagesTabProps {
  threads: SmsThread[]
  refreshThreads: () => void
}

export const MessagesTab: React.FC<MessagesTabProps> = ({ threads, refreshThreads }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [composing, setComposing] = useState(false)
  const [newNumber, setNewNumber] = useState('')
  const [composingThread, setComposingThread] = useState<SmsThread | null>(null)

  const handleComposeSubmit = (number: string) => {
    const trimmed = number.trim()
    if (!trimmed) return
    
    // Check if thread already exists in history
    const existing = threads.find(t => t.address === trimmed || t.id === trimmed)
    if (existing) {
      setSelectedThreadId(existing.id)
    } else {
      // Create a temporary local composing thread
      const tempThread: SmsThread = {
        id: trimmed,
        address: trimmed,
        name: trimmed,
        lastMessage: '',
        timestamp: new Date().toISOString(),
        messages: []
      }
      setComposingThread(tempThread)
      setSelectedThreadId(trimmed)
    }
    setComposing(false)
    setNewNumber('')
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Filter threads by contact name or number
  const filteredThreads = threads.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.address.includes(searchQuery)
  )

  const selectedThread = threads.find((t) => t.id === selectedThreadId) || (composingThread?.id === selectedThreadId ? composingThread : null)

  // Fetch messages for selected thread
  const fetchMessages = useCallback(async (threadId: string) => {
    if (composingThread && composingThread.id === threadId) {
      setMessages([])
      setLoadingMessages(false)
      return
    }
    setLoadingMessages(true)
    try {
      const msgs = await window.api.getSmsMessages(threadId)
      // Sort messages by timestamp ascending
      const sorted = (msgs || []).sort(
        (a: SmsMessage, b: SmsMessage) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      setMessages(sorted)
    } catch (err) {
      console.error('Error fetching messages:', err)
    } finally {
      setLoadingMessages(false)
    }
  }, [composingThread])

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (selectedThreadId) {
      fetchMessages(selectedThreadId)
      const selected = threads.find((t) => t.id === selectedThreadId)
      if (selected && selected.unread) {
        window.api.markThreadRead(selectedThreadId).then(() => {
          refreshThreads()
        })
      }
    } else {
      setMessages([])
    }
  }, [selectedThreadId, fetchMessages, threads, refreshThreads])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Listen to new incoming SMS
  useEffect(() => {
    const handleSmsEvent = (_event: any, payload: any) => {
      if (payload.type === 'SMS_RECEIVED') {
        const sms = payload.data
        // If the message belongs to current thread, append it
        if (selectedThreadId && (sms.address === selectedThreadId || sms.threadId === selectedThreadId)) {
          setMessages((prev) => [
            ...prev,
            {
              id: sms.id || `sms_${Date.now()}`,
              threadId: selectedThreadId,
              address: sms.address,
              name: sms.name,
              body: sms.body,
              timestamp: sms.timestamp,
              direction: 'in'
            }
          ])
        }
        refreshThreads()
      }
    }

    const sub = window.api.onPhoneEvent(handleSmsEvent)
    return () => {
      window.api.removePhoneEventListener(sub)
    }
  }, [selectedThreadId, refreshThreads])

  // Send message handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || !selectedThread) return

    setSending(true)
    const text = inputText.trim()
    const toAddress = selectedThread.address

    try {
      const success = await window.api.sendSMS(toAddress, text)
      if (success) {
        // Optimistically append sent message
        const optimisticMsg: SmsMessage = {
          id: `sms_sent_${Date.now()}`,
          threadId: selectedThread.id,
          address: toAddress,
          name: selectedThread.name,
          body: text,
          timestamp: new Date().toISOString(),
          direction: 'out'
        }
        setMessages((prev) => [...prev, optimisticMsg])
        setInputText('')
        
        // If we were composing, clear composingThread so that it now reads from the updated DB
        if (composingThread && composingThread.id === selectedThread.id) {
          setComposingThread(null)
        }

        // Refresh SMS list after delay to sync database
        setTimeout(() => {
          refreshThreads()
        }, 1000)
      } else {
        alert('Failed to send SMS. Make sure phone is connected.')
      }
    } catch (err) {
      console.error('Error sending SMS:', err)
      alert('Error sending SMS.')
    } finally {
      setSending(false)
    }
  }

  // Format date/time
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <div className="flex-1 flex h-full bg-primary overflow-hidden select-none">
      
      {/* 1. Threads Panel (Left) */}
      <div className="w-80 border-r border-border flex flex-col h-full bg-sidebar">
        
        {/* Search header */}
        <div className="p-4 border-b border-border flex-shrink-0 flex flex-col space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Conversations</span>
            <button
              onClick={() => setComposing(!composing)}
              className="px-2.5 py-1 bg-accent hover:bg-accent/80 text-white rounded text-[10.5px] font-bold transition-colors"
            >
              {composing ? 'Cancel' : '+ New'}
            </button>
          </div>
          
          {composing && (
            <div className="relative">
              <input
                type="text"
                placeholder="Phone number..."
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleComposeSubmit(newNumber)
                  }
                }}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent placeholder:text-dim"
                autoFocus
              />
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-dim" size={16} />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-accent placeholder:text-dim"
            />
          </div>
        </div>

        {/* Threads List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/30">
          {filteredThreads.length === 0 ? (
            <div className="p-6 text-center text-dim space-y-2">
              <MessageSquare size={32} className="mx-auto opacity-20" />
              <p className="text-xs">No conversations</p>
            </div>
          ) : (
            filteredThreads.map((thread) => {
              const isSelected = thread.id === selectedThreadId
              const initials = (thread.name || 'U').charAt(0).toUpperCase()
              return (
                <div
                  key={thread.id}
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={`p-4 flex space-x-3 hover:bg-hover cursor-pointer border-l-2 transition-all ${
                    isSelected ? 'bg-hover border-accent' : 'border-transparent'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-sm font-bold text-accent flex-shrink-0 relative">
                    {initials}
                    {thread.unread && (
                      <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-accent border border-sidebar" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <h4 className={`text-xs truncate ${thread.unread ? 'text-white font-bold' : 'text-white'}`}>
                        {thread.name || thread.address}
                      </h4>
                      <span className="text-[10px] text-dim">{formatTime(thread.timestamp)}</span>
                    </div>
                    <p className={`text-xs mt-1 truncate ${thread.unread ? 'text-white font-semibold' : 'text-secondary'}`}>
                      {thread.lastMessage}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>

      </div>

      {/* 2. Conversation Panel (Right) */}
      <div className="flex-1 flex flex-col h-full bg-primary relative">
        
        {selectedThread ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-border bg-sidebar/55 flex items-center space-x-3 flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-xs font-bold text-accent">
                {(selectedThread.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{selectedThread.name || selectedThread.address}</h3>
                <p className="text-[10px] text-muted">{selectedThread.address}</p>
              </div>
            </div>

            {/* Chat Messages Log */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingMessages ? (
                <div className="h-full flex items-center justify-center text-dim space-x-2">
                  <Loader2 className="animate-spin text-accent" size={20} />
                  <span className="text-xs">Loading message logs...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-dim text-xs">
                  No messages in this chat.
                </div>
              ) : (
                messages.map((msg) => {
                  const isSentByMe = msg.direction === 'out'
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isSentByMe ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[70%] px-4 py-2.5 rounded-xl text-xs leading-relaxed break-words shadow ${
                          isSentByMe
                            ? 'bg-accent text-white rounded-tr-none'
                            : 'bg-card text-secondary border border-border/80 rounded-tl-none'
                        }`}
                      >
                        {msg.body}
                      </div>
                      <span className="text-[9px] text-dim mt-1 px-1">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Send Message Input Box */}
            <form
              onSubmit={handleSendMessage}
              className="p-4 border-t border-border bg-sidebar flex items-center space-x-3 flex-shrink-0"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a message..."
                disabled={sending}
                className="flex-1 bg-card border border-border rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent disabled:opacity-40"
              />
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                className="p-2.5 bg-accent hover:bg-accent-dark text-white rounded-lg transition-colors flex items-center justify-center disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              </button>
            </form>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-dim space-y-3">
            <MessageSquare size={48} className="opacity-25" />
            <h3 className="text-sm font-semibold text-white/90">Select a conversation</h3>
            <p className="text-xs px-8 text-center max-w-sm">
              Choose an SMS thread from the left panel to reply or view chat log.
            </p>
          </div>
        )}

      </div>

    </div>
  )
}
