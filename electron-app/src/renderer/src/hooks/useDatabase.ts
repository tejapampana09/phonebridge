import { useState, useEffect, useCallback } from 'react'
import { PhoneNotification, CallRecord, SmsThread, PhotoMeta, DeviceStatus, ContactRecord, AppRecord, CalendarEventRecord } from '../types'

declare global {
  interface Window {
    api: any
  }
}

export function useDatabase() {
  const [notifications, setNotifications] = useState<PhoneNotification[]>([])
  const [calls, setCalls] = useState<CallRecord[]>([])
  const [smsThreads, setSmsThreads] = useState<SmsThread[]>([])
  const [photos, setPhotos] = useState<PhotoMeta[]>([])
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null)
  const [contacts, setContacts] = useState<ContactRecord[]>([])
  const [apps, setApps] = useState<AppRecord[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventRecord[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await window.api.getNotifications()
      setNotifications(data || [])
    } catch (err) {
      console.error('Error fetching notifications:', err)
    }
  }, [])

  const fetchCalls = useCallback(async () => {
    try {
      const data = await window.api.getCalls()
      setCalls(data || [])
    } catch (err) {
      console.error('Error fetching calls:', err)
    }
  }, [])

  const fetchSmsThreads = useCallback(async () => {
    try {
      const data = await window.api.getSmsThreads()
      setSmsThreads(data || [])
    } catch (err) {
      console.error('Error fetching SMS threads:', err)
    }
  }, [])

  const fetchPhotos = useCallback(async () => {
    try {
      const data = await window.api.getPhotos()
      setPhotos(data || [])
    } catch (err) {
      console.error('Error fetching photos:', err)
    }
  }, [])

  const fetchDeviceStatus = useCallback(async () => {
    try {
      const data = await window.api.getDeviceStatus()
      const conn = await window.api.getConnectionStatus()
      if (data) {
        setDeviceStatus({
          ...data,
          connected: conn.wsConnected || conn.btConnected,
          btConnected: conn.btConnected
        })
      } else {
        setDeviceStatus({
          battery: 0,
          charging: false,
          network: 'offline',
          signal: 0,
          deviceName: conn.deviceName || 'Android Phone',
          connected: conn.wsConnected || conn.btConnected,
          btConnected: conn.btConnected
        })
      }
    } catch (err) {
      console.error('Error fetching device status:', err)
    }
  }, [])

  const fetchContacts = useCallback(async () => {
    try {
      const data = await window.api.getContacts()
      setContacts(data || [])
    } catch (err) {
      console.error('Error fetching contacts:', err)
    }
  }, [])

  const fetchApps = useCallback(async () => {
    try {
      const data = await window.api.getApps()
      setApps(data || [])
    } catch (err) {
      console.error('Error fetching apps:', err)
    }
  }, [])

  const fetchCalendarEvents = useCallback(async () => {
    try {
      const data = await window.api.getCalendarEvents()
      setCalendarEvents(data || [])
    } catch (err) {
      console.error('Error fetching calendar events:', err)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([
      fetchNotifications(),
      fetchCalls(),
      fetchSmsThreads(),
      fetchPhotos(),
      fetchDeviceStatus(),
      fetchContacts(),
      fetchApps(),
      fetchCalendarEvents()
    ])
    setLoading(false)
  }, [fetchNotifications, fetchCalls, fetchSmsThreads, fetchPhotos, fetchDeviceStatus, fetchContacts, fetchApps, fetchCalendarEvents])

  useEffect(() => {
    refreshAll()

    // Listen to real-time events from main process (relayed from WebSocket/Bluetooth)
    const phoneSubscription = window.api.onPhoneEvent((_event: any, payload: any) => {
      console.log('[useDatabase] Real-time phone event received:', payload)
      const { type } = payload

      if (type === 'NOTIFICATION' || type === 'NOTIFICATION_REMOVED') {
        fetchNotifications()
      } else if (type === 'CALL_HISTORY' || type === 'CALL_UPDATE') {
        fetchCalls()
      } else if (type === 'SMS_RECEIVED' || type === 'SMS_HISTORY') {
        fetchSmsThreads()
      } else if (type === 'PHOTO_METADATA' || type === 'PHOTO_DOWNLOADED') {
        fetchPhotos()
      } else if (type === 'DEVICE_STATUS') {
        // Immediately mark connected since receiving this message proves the phone is live
        setDeviceStatus(prev => ({
          battery: payload.data?.battery ?? prev?.battery ?? 0,
          charging: payload.data?.charging ?? prev?.charging ?? false,
          network: payload.data?.network ?? prev?.network ?? 'offline',
          signal: payload.data?.signal ?? prev?.signal ?? 0,
          deviceName: payload.data?.deviceName ?? prev?.deviceName ?? 'Android Phone',
          connected: true,
          btConnected: prev?.btConnected ?? false
        }))
        fetchDeviceStatus()
      } else if (type === 'CONTACTS_HISTORY') {
        fetchContacts()
      } else if (type === 'APPS_HISTORY') {
        fetchApps()
      } else if (type === 'CALENDAR_HISTORY') {
        fetchCalendarEvents()
      }
    })

    // Listen to connection changes
    const connectionSubscription = window.api.onConnectionChanged((_event: any, payload: any) => {
      console.log('[useDatabase] Connection state changed:', payload)
      fetchDeviceStatus()
    })

    return () => {
      window.api.removePhoneEventListener(phoneSubscription)
      window.api.removeConnectionChangedListener(connectionSubscription)
    }
  }, [refreshAll, fetchNotifications, fetchCalls, fetchSmsThreads, fetchPhotos, fetchDeviceStatus, fetchContacts, fetchApps])

  return {
    notifications,
    calls,
    smsThreads,
    photos,
    deviceStatus,
    contacts,
    apps,
    loading,
    refreshAll,
    fetchNotifications,
    fetchCalls,
    fetchSmsThreads,
    fetchPhotos,
    fetchDeviceStatus,
    fetchContacts,
    fetchApps,
    calendarEvents,
    fetchCalendarEvents
  }
}
