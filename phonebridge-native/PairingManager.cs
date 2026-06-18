using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Windows.Devices.Bluetooth;
using Windows.Devices.Enumeration;

namespace phonebridge_native
{
    public class PairedDeviceInfo
    {
        public string Name { get; set; } = string.Empty;
        public string Id { get; set; } = string.Empty;
        public bool IsConnected { get; set; }
        public bool IsPaired { get; set; }
    }

    public static class PairingManager
    {
        public static async Task<List<PairedDeviceInfo>> GetPairedDevicesAsync()
        {
            var result = new List<PairedDeviceInfo>();
            try
            {
                DiagnosticsManager.Log("Querying paired Bluetooth devices...");
                string selector = BluetoothDevice.GetDeviceSelectorFromPairingState(true);
                var devices = await DeviceInformation.FindAllAsync(selector);
                
                foreach (var device in devices)
                {
                    bool isConnected = false;
                    try
                    {
                        using (var btDevice = await BluetoothDevice.FromIdAsync(device.Id))
                        {
                            if (btDevice != null)
                            {
                                isConnected = btDevice.ConnectionStatus == BluetoothConnectionStatus.Connected;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        DiagnosticsManager.Log($"Error getting connection status for device '{device.Name}' ({device.Id}): {ex.Message}", "WARNING");
                    }

                    result.Add(new PairedDeviceInfo
                    {
                        Name = device.Name,
                        Id = device.Id,
                        IsConnected = isConnected,
                        IsPaired = true
                    });
                }
                DiagnosticsManager.Log($"Found {result.Count} paired device(s).");
            }
            catch (Exception ex)
            {
                DiagnosticsManager.LogException(ex, "GetPairedDevicesAsync");
            }
            return result;
        }

        public static void OpenBluetoothSettings()
        {
            try
            {
                DiagnosticsManager.Log("Launching Windows Bluetooth settings (ms-settings:bluetooth)...");
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "ms-settings:bluetooth",
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                DiagnosticsManager.LogException(ex, "OpenBluetoothSettings");
            }
        }
    }
}
