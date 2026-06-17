import React, { useState, useEffect } from 'react'
import { AppRecord } from '../types'
import { AppWindow, Search, ExternalLink, Clock } from 'lucide-react'

interface AppsTabProps {
  apps: AppRecord[]
}

export const AppsTab: React.FC<AppsTabProps> = ({ apps }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [recentPackages, setRecentPackages] = useState<string[]>([])

  // Load recent apps from settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const s = await window.api.getSettings()
        if (s && s.recentApps) {
          setRecentPackages(s.recentApps)
        }
      } catch (err) {
        console.error('Failed to load recent apps settings:', err)
      }
    }
    loadSettings()
  }, [])

  const handleLaunchApp = async (app: AppRecord) => {
    try {
      await window.api.launchApp(app.package)
      // Add package to the front, remove duplicates, keep top 6
      const updatedList = [app.package, ...recentPackages.filter(p => p !== app.package)].slice(0, 6)
      setRecentPackages(updatedList)
      await window.api.setSetting('recentApps', updatedList)
    } catch (err) {
      console.error('Failed to launch app:', err)
    }
  }

  // Filter apps by search query
  const filteredApps = apps.filter(
    (app) =>
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.package.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Map package names to actual AppRecords
  const recentApps = recentPackages
    .map(pkg => apps.find(a => a.package === pkg))
    .filter((a): a is AppRecord => !!a)

  return (
    <div className="flex-1 flex flex-col h-full bg-primary overflow-hidden select-none">
      
      {/* Header */}
      <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Launcher Apps</h2>
          <p className="text-xs text-muted mt-0.5">Browse and launch applications installed on your mobile device</p>
        </div>
        
        {/* Search Bar */}
        <div className="relative w-72">
          <Search className="absolute left-3 top-2.5 text-dim" size={16} />
          <input
            type="text"
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-accent placeholder:text-dim transition-colors"
          />
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        
        {/* RECENT APPS SECTION */}
        {recentApps.length > 0 && !searchQuery && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-accent tracking-wider uppercase flex items-center space-x-1.5">
              <Clock size={12} />
              <span>Recently Used Apps</span>
            </h3>
            
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-5 bg-sidebar/20 p-5 rounded-2xl border border-border/40">
              {recentApps.map((app) => {
                const initials = (app.name || 'A').charAt(0).toUpperCase()
                return (
                  <div
                    key={`recent-${app.package}`}
                    onClick={() => handleLaunchApp(app)}
                    className="group bg-sidebar border border-border/70 hover:border-accent/40 rounded-xl p-4 flex flex-col items-center text-center space-y-3 shadow-md hover:shadow-xl hover:bg-hover transition-all duration-200 transform hover:-translate-y-1 relative cursor-pointer"
                    title={`${app.name} (${app.package})`}
                  >
                    {/* App Icon Container */}
                    <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center text-xl font-bold text-accent shadow-inner relative overflow-hidden group-hover:border-accent/40 transition-all duration-200">
                      {app.icon ? (
                        <img
                          src={app.icon}
                          alt={app.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>

                    {/* App Label */}
                    <div className="space-y-0.5 w-full">
                      <h4 className="text-xs font-bold text-white truncate max-w-full px-1">
                        {app.name}
                      </h4>
                      <p className="text-[9px] text-muted truncate max-w-full px-1">
                        {app.package}
                      </p>
                    </div>

                    {/* Open Icon on hover */}
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-accent">
                      <ExternalLink size={10} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ALL APPS GRID */}
        <div className="space-y-4">
          {recentApps.length > 0 && !searchQuery && (
            <h3 className="text-xs font-bold text-dim tracking-wider uppercase">
              All Applications
            </h3>
          )}

          {filteredApps.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center text-dim space-y-3">
              <AppWindow size={48} className="opacity-25 animate-pulse text-accent" />
              <p className="text-sm font-semibold">No applications found</p>
              <p className="text-xs max-w-sm px-6">
                {searchQuery ? 'Try adjusting your search query.' : 'App launcher grid will sync automatically on pairing.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-5">
              {filteredApps.map((app) => {
                const initials = (app.name || 'A').charAt(0).toUpperCase()
                return (
                  <div
                    key={app.package}
                    onClick={() => handleLaunchApp(app)}
                    className="group bg-sidebar border border-border/70 hover:border-accent/40 rounded-xl p-4 flex flex-col items-center text-center space-y-3 shadow-md hover:shadow-xl hover:bg-hover transition-all duration-200 transform hover:-translate-y-1 relative cursor-pointer"
                    title={`${app.name} (${app.package})`}
                  >
                    {/* App Icon Container */}
                    <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center text-xl font-bold text-accent shadow-inner relative overflow-hidden group-hover:border-accent/40 transition-all duration-200">
                      {app.icon ? (
                        <img
                          src={app.icon}
                          alt={app.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>

                    {/* App Label */}
                    <div className="space-y-0.5 w-full">
                      <h4 className="text-xs font-bold text-white truncate max-w-full px-1">
                        {app.name}
                      </h4>
                      <p className="text-[9px] text-muted truncate max-w-full px-1">
                        {app.package}
                      </p>
                    </div>

                    {/* Open Icon on hover */}
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-accent">
                      <ExternalLink size={10} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  )
}
