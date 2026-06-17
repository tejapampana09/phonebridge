import { useState, useEffect, useCallback } from 'react'
import { PhoneNotification, CallRecord, SmsThread, PhotoMeta, DeviceStatus } from '../types'

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
          connected: conn.wsConnected || conn.btConnected
        })
      }
    } catch (err) {
      console.error('Error fetching device status:', err)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([
      fetchNotifications(),
      fetchCalls(),
      fetchSmsThreads(),
      fetchPhotos(),
      fetchDeviceStatus()
    ])
    setLoading(false)
  }, [fetchNotifications, fetchCalls, fetchSmsThreads, fetchPhotos, fetchDeviceStatus])

  useEffect(() => {
    refreshAll()

    // Listen to real-time events from main process (relayed from WebSocket/Bluetooth)
    const phoneSubscription = window.api.onPhoneEvent((_event: any, payload: any) => {
      console.log('[useDatabase] Real-time phone event received:', payload)
      const { type } = payload

      if (type === 'NOTIFICATION') {
        fetchNotifications()
      } else if (type === 'CALL_HISTORY' || type === 'CALL_INCOMING' || type === 'CALL_UPDATE') {
        fetchCalls()
      } else if (type === 'SMS_RECEIVED' || type === 'SMS_HISTORY') {
        fetchSmsThreads()
      } else if (type === 'PHOTO_METADATA') {
        fetchPhotos()
      } else if (type === 'DEVICE_STATUS') {
        fetchDeviceStatus()
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
  }, [refreshAll, fetchNotifications, fetchCalls, fetchSmsThreads, fetchPhotos, fetchDeviceStatus])

  return {
    notifications,
    calls,
    smsThreads,
    photos,
    deviceStatus,
    loading,
    refreshAll,
    fetchNotifications,
    fetchCalls,
    fetchSmsThreads,
    fetchPhotos,
    fetchDeviceStatus
  }
}
