import React, { useState } from 'react'
import { ContactRecord } from '../types'
import { Search, User, Phone } from 'lucide-react'

interface ContactsTabProps {
  contacts: ContactRecord[]
}

const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.517 2.266 2.27 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.713-1.458L0 24zm6.59-4.846c1.6.95 3.16 1.45 4.8 1.45 5.518 0 10.007-4.49 10.01-10.014.002-2.673-1.037-5.187-2.927-7.078-1.89-1.89-4.407-2.93-7.084-2.93C5.875 1.583 1.387 6.075 1.384 11.6c-.001 1.743.456 3.447 1.32 4.966l-.995 3.63 3.73-.977zm12.115-7.3c-.33-.165-1.95-.963-2.25-1.073-.3-.11-.52-.165-.74.165-.22.33-.85 1.073-1.04 1.293-.19.22-.38.24-.71.075-.33-.165-1.393-.513-2.653-1.637-.98-.874-1.64-1.953-1.83-2.28-.19-.33-.02-.51.145-.674.15-.15.33-.38.5-.57.17-.19.22-.33.33-.55.11-.22.05-.41-.02-.57-.08-.165-.74-1.785-1.01-2.44-.27-.648-.54-.56-.74-.57-.19-.01-.41-.01-.63-.01-.22 0-.58.08-.88.41-.3.33-1.15 1.127-1.15 2.746 0 1.62 1.18 3.187 1.34 3.407.16.22 2.322 3.546 5.625 4.974.785.34 1.396.542 1.874.694.79.25 1.5.213 2.07.128.63-.093 1.95-.798 2.225-1.568.275-.77.275-1.43.19-1.568-.08-.14-.3-.22-.63-.385z"/>
  </svg>
)

const InstagramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
)

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

  const handleWhatsApp = (number: string) => {
    const cleaned = number.replace(/\D/g, '')
    if (cleaned) {
      window.open(`https://wa.me/${cleaned}`, '_blank')
    }
  }

  const handleInstagram = () => {
    window.open('https://instagram.com/direct/inbox/', '_blank')
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

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {/* Dial Button */}
                    <button
                      onClick={() => handleDial(c.number)}
                      className="p-2.5 bg-card hover:bg-hover text-accent rounded-lg border border-border/80 hover:border-accent/30 transition-all flex items-center justify-center"
                      title={`Call ${c.name}`}
                    >
                      <Phone size={14} />
                    </button>
                    
                    {/* WhatsApp Button */}
                    <button
                      onClick={() => handleWhatsApp(c.number)}
                      className="p-2.5 bg-card hover:bg-hover text-emerald-500 rounded-lg border border-border/80 hover:border-emerald-500/30 transition-all flex items-center justify-center"
                      title={`WhatsApp ${c.name}`}
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5 fill-current" />
                    </button>

                    {/* Instagram Button */}
                    <button
                      onClick={handleInstagram}
                      className="p-2.5 bg-card hover:bg-hover text-pink-500 rounded-lg border border-border/80 hover:border-pink-500/30 transition-all flex items-center justify-center"
                      title="Instagram DMs"
                    >
                      <InstagramIcon className="w-3.5 h-3.5 fill-current" />
                    </button>
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
