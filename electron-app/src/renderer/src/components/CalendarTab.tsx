import React, { useState } from 'react'
import { CalendarEventRecord } from '../types'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  MapPin,
  Clock,
  FileText,
  Calendar,
  AlertCircle
} from 'lucide-react'

interface CalendarTabProps {
  calendarEvents: CalendarEventRecord[]
  refreshEvents: () => void
  deviceConnected: boolean
}

export const CalendarTab: React.FC<CalendarTabProps> = ({
  calendarEvents,
  refreshEvents,
  deviceConnected
}) => {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form State
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [startDateStr, setStartDateStr] = useState('')
  const [startTimeStr, setStartTimeStr] = useState('')
  const [endDateStr, setEndTimeStr] = useState('') // Note: we'll use local state for end date
  const [endDateValueStr, setEndDateValueStr] = useState('')
  const [endTimeValueStr, setEndTimeValueStr] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Calendar calculations
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const startingDayOfWeek = firstDayOfMonth.getDay() // 0 = Sunday, 1 = Monday...
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Format month and year label
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    )
  }

  // Get events on a specific day
  const getEventsForDay = (date: Date): CalendarEventRecord[] => {
    return calendarEvents.filter((event) => {
      try {
        const eventDate = new Date(event.start)
        return isSameDay(eventDate, date)
      } catch {
        return false
      }
    })
  }

  // Handle Event Creation
  const handleOpenAddModal = () => {
    if (!deviceConnected) return
    const yearStr = selectedDate.getFullYear()
    const monthStr = String(selectedDate.getMonth() + 1).padStart(2, '0')
    const dayStr = String(selectedDate.getDate()).padStart(2, '0')
    const localDateString = `${yearStr}-${monthStr}-${dayStr}`
    
    // Set defaults
    setTitle('')
    setDescription('')
    setLocation('')
    setStartDateStr(localDateString)
    setStartTimeStr('12:00')
    setEndDateValueStr(localDateString)
    setEndTimeValueStr('13:00')
    setErrorMsg('')
    setIsModalOpen(true)
  }

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setErrorMsg('Title is required')
      return
    }

    try {
      const startDateTime = new Date(`${startDateStr}T${startTimeStr}`)
      const endDateTime = new Date(`${endDateValueStr}T${endTimeValueStr}`)

      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        setErrorMsg('Invalid start or end date/time')
        return
      }

      if (endDateTime.getTime() <= startDateTime.getTime()) {
        setErrorMsg('End date/time must be after start date/time')
        return
      }

      setIsSubmitting(true)
      const success = await window.api.createCalendarEvent({
        title: title.trim(),
        description: description.trim(),
        start: startDateTime.getTime(),
        end: endDateTime.getTime(),
        location: location.trim()
      })

      if (success) {
        setIsModalOpen(false)
        refreshEvents()
      } else {
        setErrorMsg('Failed to create event. Please verify calendar access permissions on your phone.')
      }
    } catch (err) {
      console.error(err)
      setErrorMsg('An error occurred while scheduling the event')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteEvent = async (eventId: string) => {
    if (!deviceConnected) return
    if (confirm('Are you sure you want to delete this event?')) {
      try {
        const success = await window.api.deleteCalendarEvent(eventId)
        if (success) {
          refreshEvents()
        } else {
          alert('Failed to delete event. Please check calendar permissions.')
        }
      } catch (err) {
        console.error(err)
        alert('An error occurred while deleting the event.')
      }
    }
  }

  const selectedDayEvents = getEventsForDay(selectedDate)

  // Generate calendar cells
  const calendarCells: (Date | null)[] = []
  
  // Empty slots for starting days
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarCells.push(null)
  }

  // Days of the month
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(new Date(year, month, d))
  }

  // Format time (HH:MM) from ISO string
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <div className="flex h-full bg-primary select-none overflow-hidden animate-fade-in">
      {/* LEFT: Calendar Monthly Grid */}
      <div className="flex-1 p-6 flex flex-col h-full border-r border-border overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-accent/10 border border-accent/20 rounded-lg text-accent">
              <Calendar size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Calendar</h2>
              <p className="text-[10px] text-dim">Sync and schedule events directly on your phone</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 bg-card hover:bg-hover border border-border rounded-lg text-secondary hover:text-white transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-white w-28 text-center">
              {monthNames[month]} {year}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 bg-card hover:bg-hover border border-border rounded-lg text-secondary hover:text-white transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[11px] font-bold text-dim uppercase">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1.5 flex-1 min-h-[300px]">
          {calendarCells.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="bg-transparent" />
            }

            const isSelected = isSameDay(date, selectedDate)
            const isToday = isSameDay(date, new Date())
            const dayEvents = getEventsForDay(date)
            const hasEvents = dayEvents.length > 0

            return (
              <button
                key={`day-${date.getDate()}`}
                onClick={() => setSelectedDate(date)}
                className={`group flex flex-col justify-between p-2.5 min-h-[64px] rounded-xl border transition-all text-left relative ${
                  isSelected
                    ? 'bg-accent/15 border-accent text-white shadow-lg shadow-accent/5'
                    : isToday
                    ? 'bg-card border-accent/40 hover:bg-hover hover:border-accent/60 text-accent font-semibold'
                    : 'bg-card border-border/60 hover:bg-hover hover:border-border text-secondary hover:text-white'
                }`}
              >
                <span className="text-xs font-semibold">{date.getDate()}</span>
                
                {/* Event indicators */}
                {hasEvents && (
                  <div className="flex items-center space-x-1 mt-1.5 overflow-hidden">
                    {dayEvents.slice(0, 3).map((e, idx) => (
                      <span
                        key={e.id || idx}
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSelected ? 'bg-white' : 'bg-accent'
                        }`}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[9px] font-bold opacity-60 leading-none">
                        +{dayEvents.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* RIGHT: Detail View */}
      <div className="w-96 p-6 bg-sidebar/30 flex flex-col h-full overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xs font-bold text-dim uppercase tracking-wider">
              {selectedDate.toLocaleDateString([], { weekday: 'long' })}
            </h3>
            <h2 className="text-sm font-bold text-white mt-0.5">
              {selectedDate.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
          </div>
          <button
            onClick={handleOpenAddModal}
            disabled={!deviceConnected}
            className="flex items-center space-x-1 bg-accent hover:bg-accent/80 text-white rounded-lg text-xs font-bold px-3 py-1.5 shadow-md shadow-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            <span>Add Event</span>
          </button>
        </div>

        {/* Selected Date Events List */}
        <div className="flex-1 space-y-3.5">
          {selectedDayEvents.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-card/40 border border-border/60 rounded-xl text-dim space-y-2">
              <Calendar size={24} className="opacity-30" />
              <p className="text-xs font-medium">No events scheduled</p>
              <p className="text-[10px] max-w-[200px]">Schedule call remainders, meetings, or custom alerts.</p>
            </div>
          ) : (
            selectedDayEvents.map((event) => (
              <div
                key={event.id}
                className="group bg-card border border-border/80 hover:border-accent/40 rounded-xl p-4 transition-all duration-150 relative"
              >
                {/* Event Delete Trigger */}
                <button
                  onClick={() => handleDeleteEvent(event.id)}
                  disabled={!deviceConnected}
                  className="absolute right-3.5 top-3.5 p-1 rounded hover:bg-hover text-dim hover:text-danger opacity-0 group-hover:opacity-100 disabled:opacity-0 transition-opacity"
                  title="Delete Event"
                >
                  <Trash2 size={13} />
                </button>

                <h4 className="text-xs font-bold text-white pr-6 line-clamp-1">{event.title}</h4>
                
                {/* Time Range */}
                <div className="flex items-center space-x-1.5 text-[10px] text-accent mt-1.5 font-semibold">
                  <Clock size={11} />
                  <span>
                    {formatTime(event.start)} - {formatTime(event.end)}
                  </span>
                </div>

                {/* Location */}
                {event.location && (
                  <div className="flex items-center space-x-1.5 text-[10px] text-muted mt-1 truncate">
                    <MapPin size={11} className="text-dim" />
                    <span>{event.location}</span>
                  </div>
                )}

                {/* Description */}
                {event.description && (
                  <div className="flex items-start space-x-1.5 text-[10px] text-secondary mt-2 bg-primary/30 p-2 rounded-lg border border-border/40">
                    <FileText size={11} className="text-dim mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2 leading-normal">{event.description}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Sync Status Overlay Warning */}
        {!deviceConnected && (
          <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-xl flex items-start space-x-2.5 text-[10px] text-warning leading-normal">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>Calendar updates require an active phone link connection. Reconnect to add or remove events.</span>
          </div>
        )}
      </div>

      {/* Scheduler Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateEvent}
            className="bg-sidebar border border-border w-full max-w-md rounded-2xl shadow-2xl p-6 relative animate-fade-in"
          >
            <div className="flex items-center space-x-2.5 mb-5">
              <Calendar className="text-accent" size={18} />
              <h2 className="text-sm font-bold text-white">Schedule Calendar Event</h2>
            </div>

            {errorMsg && (
              <div className="mb-4 p-2.5 bg-danger/10 border border-danger/25 rounded-lg text-danger text-[10px] flex items-center space-x-1.5">
                <AlertCircle size={12} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* Event Title */}
              <div>
                <label className="block text-[10px] text-dim font-bold uppercase tracking-wider mb-1.5">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Event name (e.g. Call John, Lunch Meeting)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-card border border-border focus:border-accent rounded-lg px-3 py-2 text-white focus:outline-none placeholder-dim"
                />
              </div>

              {/* Start Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-dim font-bold uppercase tracking-wider mb-1.5">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={startDateStr}
                    onChange={(e) => setStartDateStr(e.target.value)}
                    className="w-full bg-card border border-border focus:border-accent rounded-lg px-3 py-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-dim font-bold uppercase tracking-wider mb-1.5">
                    Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={startTimeStr}
                    onChange={(e) => setStartTimeStr(e.target.value)}
                    className="w-full bg-card border border-border focus:border-accent rounded-lg px-3 py-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* End Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-dim font-bold uppercase tracking-wider mb-1.5">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={endDateValueStr}
                    onChange={(e) => setEndDateValueStr(e.target.value)}
                    className="w-full bg-card border border-border focus:border-accent rounded-lg px-3 py-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-dim font-bold uppercase tracking-wider mb-1.5">
                    End Time
                  </label>
                  <input
                    type="time"
                    required
                    value={endTimeValueStr}
                    onChange={(e) => setEndTimeValueStr(e.target.value)}
                    className="w-full bg-card border border-border focus:border-accent rounded-lg px-3 py-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="block text-[10px] text-dim font-bold uppercase tracking-wider mb-1.5">
                  Location
                </label>
                <input
                  type="text"
                  placeholder="Address or virtual link"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-card border border-border focus:border-accent rounded-lg px-3 py-2 text-white focus:outline-none placeholder-dim"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] text-dim font-bold uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  placeholder="Additional event details..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-card border border-border focus:border-accent rounded-lg px-3 py-2 text-white focus:outline-none placeholder-dim resize-none"
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="mt-6 flex justify-end space-x-3.5">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-border hover:bg-hover text-secondary hover:text-white rounded-lg text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg text-xs font-bold shadow-md shadow-accent/15 transition-colors disabled:opacity-40"
              >
                {isSubmitting ? 'Scheduling...' : 'Schedule Event'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
