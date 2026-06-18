using System;
using System.Threading.Tasks;
using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.Rfcomm;

namespace phonebridge_native
{
    public static class HfpManager
    {
        // Standard HFP Audio Gateway RFCOMM Service UUID
        private static readonly Guid HfpServiceUuid = new Guid("0000111f-0000-1000-8000-00805f9b34fb");

        public static async Task<bool> VerifyHfpSupportAsync(string deviceId)
        {
            try
            {
                DiagnosticsManager.Log($"Verifying HFP service support for device '{deviceId}'...");
                using (var bluetoothDevice = await BluetoothDevice.FromIdAsync(deviceId))
                {
                    if (bluetoothDevice == null)
                    {
                        DiagnosticsManager.Log("Bluetooth device could not be resolved.", "WARNING");
                        return false;
                    }

                    DiagnosticsManager.Log($"Querying RFCOMM services for '{bluetoothDevice.Name}'...");
                    var servicesResult = await bluetoothDevice.GetRfcommServicesAsync(BluetoothCacheMode.Uncached);
                    
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
    }
}
