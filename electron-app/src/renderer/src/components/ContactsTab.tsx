import React, { useState } from 'react'
import { ContactRecord } from '../types'
import { Search, User, Phone, X, Trash2 } from 'lucide-react'

interface ContactsTabProps {
  contacts: ContactRecord[]
  onRefreshContacts?: () => void
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

export const ContactsTab: React.FC<ContactsTabProps> = ({ contacts, onRefreshContacts }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(null)
  const [formName, setFormName] = useState('')
  const [formNumber, setFormNumber] = useState('')
  const [visibleCount, setVisibleCount] = useState(100)

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim() || !formNumber.trim()) return

    try {
      if (editingContact) {
        await window.api.updateContact(editingContact.id, formName.trim(), formNumber.trim())
      } else {
        await window.api.createContact(formName.trim(), formNumber.trim())
      }
      setShowFormModal(false)
      setFormName('')
      setFormNumber('')
      setEditingContact(null)
      onRefreshContacts?.()
    } catch (err) {
      console.error(err)
      alert('Failed to save contact.')
    }
  }

  // Filter contacts by name or number
  const filteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.number.includes(searchQuery)
  )

  // Sort contacts by name
  const sortedContacts = [...filteredContacts].sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  // Group by first letter
  const groupedContacts: { [key: string]: ContactRecord[] } = {}
  const paginatedContacts = sortedContacts.slice(0, visibleCount)
  paginatedContacts.forEach((c) => {
    const letter = (c.name || '#').charAt(0).toUpperCase()
    const key = /[A-Z]/.test(letter) ? letter : '#'
    if (!groupedContacts[key]) {
      groupedContacts[key] = []
    }
    groupedContacts[key].push(c)
  })

  // Get sorted keys of groups (A-Z first, then #)
  const groupKeys = Object.keys(groupedContacts).sort((a, b) => {
    if (a === '#') return 1
    if (b === '#') return -1
    return a.localeCompare(b)
  })

  // Automatically select first contact when list changes
  React.useEffect(() => {
    setVisibleCount(100)
    if (sortedContacts.length > 0) {
      const stillExists = selectedContact && sortedContacts.some(c => c.id === selectedContact.id && c.number === selectedContact.number)
      if (!stillExists) {
        setSelectedContact(sortedContacts[0])
      }
    } else {
      setSelectedContact(null)
    }
  }, [contacts, searchQuery])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 100) {
      if (visibleCount < sortedContacts.length) {
        setVisibleCount((prev) => prev + 100)
      }
    }
  }

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
    <div className="flex-1 flex h-full bg-primary overflow-hidden">
      {/* Left Pane: Search and Grouped List */}
      <div className="w-80 border-r border-border flex flex-col h-full bg-sidebar flex-shrink-0">
        {/* Search Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Contacts</h2>
              <p className="text-[10px] text-muted mt-0.5">Quickly search and dial contacts</p>
            </div>
            <button
              onClick={() => {
                setEditingContact(null)
                setFormName('')
                setFormNumber('')
                setShowFormModal(true)
              }}
              className="px-2.5 py-1 bg-accent hover:bg-accent/80 text-white rounded text-[10.5px] font-bold transition-colors"
            >
              + Add
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-dim" size={14} />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent placeholder:text-dim transition-colors"
            />
          </div>
        </div>

        {/* Scrollable Grouped List */}
        <div 
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto divide-y divide-border/10"
        >
          {groupKeys.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-dim p-4 space-y-2">
              <User size={32} className="opacity-25" />
              <p className="text-xs font-semibold">No contacts found</p>
            </div>
          ) : (
            groupKeys.map((key) => (
              <div key={key} className="p-2">
                {/* Group Letter */}
                <div className="px-3 py-1 text-[10px] font-bold text-accent tracking-wider uppercase">
                  {key}
                </div>
                {/* Group Items */}
                <div className="space-y-0.5 mt-1">
                  {groupedContacts[key].map((c) => {
                    const isSelected = selectedContact?.id === c.id && selectedContact?.number === c.number
                    const initials = (c.name || 'U').charAt(0).toUpperCase()
                    return (
                      <button
                        key={c.id + c.number}
                        onClick={() => setSelectedContact(c)}
                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center space-x-3 transition-all ${
                          isSelected
                            ? 'bg-accent/15 text-white border-l-2 border-accent'
                            : 'hover:bg-hover text-secondary hover:text-white'
                        }`}
                      >
                        {c.avatar ? (
                          <img src={c.avatar} alt={c.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate">{c.name}</p>
                          <p className="text-[10px] text-dim truncate mt-0.5">{c.number}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Pane: Selected Contact Details */}
      <div className="flex-1 flex flex-col h-full bg-primary justify-center items-center p-8 overflow-y-auto">
        {selectedContact ? (
          <div className="max-w-md w-full bg-sidebar border border-border rounded-2xl p-8 flex flex-col items-center text-center shadow-lg space-y-6">
            {/* Large Avatar */}
            {selectedContact.avatar ? (
              <img src={selectedContact.avatar} alt={selectedContact.name} className="w-24 h-24 rounded-full border-2 border-accent/30 object-cover shadow-md" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-accent/10 border-2 border-accent/30 flex items-center justify-center text-3xl font-bold text-accent shadow-inner">
                {(selectedContact.name || 'U').charAt(0).toUpperCase()}
              </div>
            )}

            {/* Name & Number */}
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white tracking-tight">{selectedContact.name}</h3>
              <p className="text-sm text-muted font-mono">{selectedContact.number}</p>
            </div>

            {/* Separator */}
            <hr className="w-full border-border/60" />

            {/* Action Buttons */}
            <div className="w-full space-y-3">
              {/* Call */}
              <button
                onClick={() => handleDial(selectedContact.number)}
                className="w-full py-2.5 px-4 bg-accent hover:bg-accent-dark text-white rounded-xl font-semibold text-xs flex items-center justify-center space-x-2.5 transition-all shadow-md hover:shadow-lg"
              >
                <Phone size={14} />
                <span>Call Device</span>
              </button>

              {/* WhatsApp */}
              <button
                onClick={() => handleWhatsApp(selectedContact.number)}
                className="w-full py-2.5 px-4 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded-xl font-semibold text-xs flex items-center justify-center space-x-2.5 transition-all"
              >
                <WhatsAppIcon className="w-3.5 h-3.5 fill-current" />
                <span>Message on WhatsApp</span>
              </button>

              {/* Instagram */}
              <button
                onClick={handleInstagram}
                className="w-full py-2.5 px-4 bg-pink-500/10 hover:bg-pink-500/25 text-pink-400 border border-pink-500/30 rounded-xl font-semibold text-xs flex items-center justify-center space-x-2.5 transition-all"
              >
                <InstagramIcon className="w-3.5 h-3.5 fill-current" />
                <span>Instagram Direct Message</span>
              </button>

              {/* Edit Contact */}
              <button
                onClick={() => {
                  setEditingContact(selectedContact)
                  setFormName(selectedContact.name)
                  setFormNumber(selectedContact.number)
                  setShowFormModal(true)
                }}
                className="w-full py-2.5 px-4 bg-card hover:bg-hover text-secondary border border-border rounded-xl font-semibold text-xs flex items-center justify-center space-x-2.5 transition-all"
              >
                <span>Edit Contact</span>
              </button>

              {/* Delete Contact */}
              <button
                onClick={async () => {
                  if (confirm(`Are you sure you want to delete ${selectedContact.name}?`)) {
                    try {
                      await window.api.deleteContact(selectedContact.id)
                      onRefreshContacts?.()
                      setSelectedContact(null)
                    } catch (err) {
                      console.error(err)
                    }
                  }
                }}
                className="w-full py-2.5 px-4 bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/30 rounded-xl font-semibold text-xs flex items-center justify-center space-x-2.5 transition-all"
              >
                <Trash2 size={14} />
                <span>Delete Contact</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center text-dim space-y-3">
            <User size={64} className="opacity-15 mx-auto" />
            <h3 className="text-sm font-semibold">No Contact Selected</h3>
            <p className="text-xs max-w-xs px-6">
              Select a contact from the left list to view details and start call/message actions.
            </p>
          </div>
        )}
      </div>

      {/* Form Modal Overlay */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleFormSubmit}
            className="bg-sidebar border border-border w-full max-w-md rounded-2xl shadow-2xl p-6 relative animate-fade-in"
          >
            <button
              type="button"
              onClick={() => setShowFormModal(false)}
              className="absolute top-4 right-4 p-1 rounded hover:bg-hover text-dim hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
            
            <div className="flex items-center space-x-3 mb-6">
              <h2 className="text-base font-bold text-white">
                {editingContact ? 'Edit Contact' : 'Create Contact'}
              </h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contact Name"
                  className="w-full bg-card border border-border rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  value={formNumber}
                  onChange={(e) => setFormNumber(e.target.value)}
                  placeholder="e.g. +1234567890"
                  className="w-full bg-card border border-border rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="px-4 py-2 bg-card border border-border text-secondary hover:text-white rounded-lg text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg text-xs font-bold shadow-md transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
