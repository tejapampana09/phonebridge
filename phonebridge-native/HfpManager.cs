using System;
using System.Linq;
using System.Threading.Tasks;
using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.Rfcomm;

namespace phonebridge_native
{
    public static class HfpManager
    {
        // Standard HFP Audio Gateway RFCOMM Service UUID
        public static readonly Guid HfpServiceUuid = new Guid("0000111f-0000-1000-8000-00805f9b34fb");

        public static async Task<bool> VerifyHfpSupportAsync(string deviceId, BluetoothCacheMode cacheMode = BluetoothCacheMode.Cached)
        {
            try
            {
                DiagnosticsManager.Log($"Verifying HFP service support for device '{deviceId}' with cacheMode={cacheMode}...");
                using (var bluetoothDevice = await BluetoothDevice.FromIdAsync(deviceId))
                {
                    if (bluetoothDevice == null)
                    {
                        DiagnosticsManager.Log("Bluetooth device could not be resolved.", "WARNING");
                        return false;
                    }

                    DiagnosticsManager.Log($"Querying RFCOMM services for '{bluetoothDevice.Name}'...");
                    var servicesResult = await bluetoothDevice.GetRfcommServicesAsync(cacheMode);
                    
                    if (servicesResult.Error == BluetoothError.Success)
                    {
                        DiagnosticsManager.Log($"Successfully retrieved {servicesResult.Services.Count} RFCOMM services.");
                        foreach (var service in servicesResult.Services)
                        {
                            if (service.ServiceId.Uuid == HfpServiceUuid)
                            {
                                DiagnosticsManager.Log("HFP (Hands-Free Profile) service UUID matched!");
                                return true;
                            }
                        }
                        DiagnosticsManager.Log("HFP service UUID was not found in the list of RFCOMM services.", "WARNING");
                    }
                    else
                    {
                        DiagnosticsManager.Log($"Error querying RFCOMM services: {servicesResult.Error}", "WARNING");
                    }
                }
            }
            catch (Exception ex)
            {
                DiagnosticsManager.LogException(ex, "VerifyHfpSupportAsync");
            }
            return false;
        }

        public static async Task<bool> ConnectHfpAsync(string deviceId)
        {
            try
            {
                DiagnosticsManager.Log($"Connecting HFP for device '{deviceId}'...");
                using (var bluetoothDevice = await BluetoothDevice.FromIdAsync(deviceId))
                {
                    if (bluetoothDevice == null)
                    {
                        DiagnosticsManager.Log("Bluetooth device could not be resolved.", "WARNING");
                        return false;
                    }

                    DiagnosticsManager.Log("Querying RFCOMM services uncached to force connection...");
                    var servicesResult = await bluetoothDevice.GetRfcommServicesAsync(BluetoothCacheMode.Uncached);
                    if (servicesResult.Error != BluetoothError.Success)
                    {
                        DiagnosticsManager.Log($"Error getting RFCOMM services: {servicesResult.Error}", "WARNING");
                        return false;
                    }

                    var hfpService = servicesResult.Services.FirstOrDefault(s => s.ServiceId.Uuid == HfpServiceUuid);
                    if (hfpService == null)
                    {
                        DiagnosticsManager.Log("HFP Service UUID not found on device.", "WARNING");
                        return false;
                    }

                    DiagnosticsManager.Log("Opening RFCOMM StreamSocket to HFP service to establish connection...");
                    using (var socket = new Windows.Networking.Sockets.StreamSocket())
                    {
                        await socket.ConnectAsync(
                            hfpService.ConnectionHostName,
                            hfpService.ConnectionServiceName,
                            Windows.Networking.Sockets.SocketProtectionLevel.BluetoothEncryptionAllowNullAuthentication);
                        DiagnosticsManager.Log("StreamSocket connection successful. HFP profile should now be active.");
                    }
                    return true;
                }
            }
            catch (Exception ex)
            {
                DiagnosticsManager.LogException(ex, "ConnectHfpAsync");
                return false;
            }
        }
    }
}
