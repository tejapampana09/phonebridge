import React, { useState } from 'react'
import { PhoneNotification } from '../types'
import { AppWindow, ChevronRight, ChevronDown, Trash2, Bell, X } from 'lucide-react'

interface AppsTabProps {
  notifications: PhoneNotification[]
  onDismissNotification: (id: string) => void
}

export const AppsTab: React.FC<AppsTabProps> = ({
  notifications,
  onDismissNotification
}) => {
  const [expandedApps, setExpandedApps] = useState<Record<string, boolean>>({})

  const activeNotifs = notifications.filter((n) => !n.dismissed)

  // Group notifications by app name
  const groupedNotifs = activeNotifs.reduce((acc, notif) => {
    if (!acc[notif.app]) {
      acc[notif.app] = []
    }
    acc[notif.app].push(notif)
    return acc
  }, {} as Record<string, PhoneNotification[]>)

  const toggleAppExpand = (appName: string) => {
    setExpandedApps((prev) => ({
      ...prev,
      [appName]: !prev[appName]
    }))
  }

  // Dismiss all notifications for a single app
  const dismissAllForApp = (appName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const appNotifs = groupedNotifs[appName] || []
    appNotifs.forEach((notif) => {
      onDismissNotification(notif.id)
    })
  }

  // Format date
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-primary overflow-hidden select-none">
      
      {/* Header */}
      <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">App Alerts</h2>
          <p className="text-xs text-muted mt-0.5">Manage and review active phone notifications grouped by app</p>
        </div>
      </div>

      {/* Grouped App Alerts List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {Object.keys(groupedNotifs).length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-dim space-y-3">
            <AppWindow size={48} className="opacity-25" />
            <p className="text-sm font-semibold">No active app alerts</p>
            <p className="text-xs max-w-sm px-6">
              When notifications arrive from your phone, they will be archived and grouped here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedNotifs).map(([appName, notifs]) => {
              const isExpanded = expandedApps[appName] || false
              const sampleNotif = notifs[0]
              
              return (
                <div
                  key={appName}
                  className="bg-sidebar border border-border/70 rounded-xl overflow-hidden shadow-md"
                >
                  {/* App Row Header */}
                  <div
                    onClick={() => toggleAppExpand(appName)}
                    className="p-4 flex items-center justify-between hover:bg-hover cursor-pointer transition-colors duration-150"
                  >
                    <div className="flex items-center space-x-3.5">
                      {/* Dropdown Chevron */}
                      <div className="text-secondary">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>

                      {/* Icon */}
                      <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-xs font-bold text-accent">
                        {sampleNotif.icon ? (
                          <img src={sampleNotif.icon} alt={appName} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <span>{appName.charAt(0)}</span>
                        )}
                      </div>

                      {/* Label & Badge */}
                      <div className="flex items-center space-x-2.5">
                        <span className="text-sm font-semibold text-white">{appName}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-accent/25 border border-accent/40 text-accent rounded-full">
                          {notifs.length}
                        </span>
                      </div>
                    </div>

                    {/* App level Actions */}
                    <button
                      onClick={(e) => dismissAllForApp(appName, e)}
                      className="flex items-center space-x-1.5 text-xs text-dim hover:text-danger p-2 hover:bg-card rounded-lg transition-colors"
                      title="Clear All for App"
                    >
                      <Trash2 size={13} />
                      <span className="hidden sm:inline font-semibold">Clear All</span>
                    </button>
                  </div>

                  {/* App Notifications Sub-list */}
                  {isExpanded && (
                    <div className="border-t border-border/50 divide-y divide-border/30 bg-primary/20">
                      {notifs.map((notif) => (
                        <div
                          key={notif.id}
                          className="p-4 pl-12 flex items-start justify-between hover:bg-hover transition-colors relative group"
                        >
                          <div className="space-y-1 pr-6">
                            <div className="flex items-center space-x-2">
                              <h4 className="text-xs font-bold text-white">{notif.title}</h4>
                              <span className="text-[9px] text-dim font-medium">{formatTime(notif.timestamp)}</span>
                            </div>
                            <p className="text-xs text-secondary leading-relaxed break-all">
                              {notif.message}
                            </p>
                          </div>
                          
                          {/* Close/Dismiss Button */}
                          <button
                            onClick={() => onDismissNotification(notif.id)}
                            className="p-1 rounded text-dim hover:text-white hover:bg-card transition-all"
                            title="Dismiss notification"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
