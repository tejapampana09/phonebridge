import React, { useState } from 'react'
import { ContactRecord } from '../types'
import { Search, User, Phone } from 'lucide-react'

interface ContactsTabProps {
  contacts: ContactRecord[]
}

export const ContactsTab: React.FC<ContactsTabProps> = ({ contacts }) => {
  const [searchQuery, setSearchQuery] = useState('')

  // Filter contacts by name or number
  const filteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.number.includes(searchQuery)
  )

  const handleDial = async (number: string) => {
    try {
      const success = await window.api.dialNumber(number)
      if (!success) {
        alert('Failed to trigger call. Make sure phone is connected.')
      }
    } catch (err) {
      console.error('Failed to dial contact:', err)
      alert('Error dialing number.')
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-primary overflow-hidden">
      
      {/* Search Header */}
      <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Contacts</h2>
          <p className="text-xs text-muted mt-0.5">Quickly search your phonebook and initiate calls</p>
        </div>
        
        {/* Search Bar */}
        <div className="relative w-72">
          <Search className="absolute left-3 top-2.5 text-dim" size={16} />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-accent placeholder:text-dim transition-colors"
          />
        </div>
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredContacts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-dim space-y-3">
            <User size={48} className="opacity-25" />
            <p className="text-sm font-semibold">No contacts found</p>
            <p className="text-xs max-w-sm px-6">
              {searchQuery ? 'Try adjusting your search criteria.' : 'Contacts list will sync automatically once paired.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContacts.map((c) => {
              const initials = (c.name || 'U').charAt(0).toUpperCase()
              return (
                <div
                  key={c.id + c.number}
                  className="bg-sidebar border border-border rounded-xl p-4 flex items-center justify-between hover:border-accent/40 hover:bg-hover transition-all duration-150"
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-sm font-bold text-accent flex-shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate" title={c.name}>
                        {c.name}
                      </h4>
                      <p className="text-xs text-muted mt-0.5 truncate">{c.number}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDial(c.number)}
                    className="p-2.5 bg-card hover:bg-hover text-accent rounded-lg border border-border/80 hover:border-accent/30 transition-all flex items-center justify-center flex-shrink-0"
                    title={`Call ${c.name}`}
                  >
                    <Phone size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
