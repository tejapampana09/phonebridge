using System;
using System.Collections.Generic;
using NAudio.CoreAudioApi;

namespace phonebridge_native
{
    public class AudioDeviceDetails
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Flow { get; set; } = string.Empty; // "Capture" or "Render"
        public bool IsHfp { get; set; }
    }

    public static class AudioDeviceManager
    {
        public static List<AudioDeviceDetails> GetDevices()
        {
            var result = new List<AudioDeviceDetails>();
            try
            {
                var enumerator = new MMDeviceEnumerator();
                
                var renderDevices = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active);
                foreach (var device in renderDevices)
                {
                    result.Add(new AudioDeviceDetails
                    {
                        Id = device.ID,
                        Name = device.FriendlyName,
                        Flow = "Render",
                        IsHfp = IsHfpDevice(device.FriendlyName, device.ID)
                    });
                }

                var captureDevices = enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active);
                foreach (var device in captureDevices)
                {
                    result.Add(new AudioDeviceDetails
                    {
                        Id = device.ID,
                        Name = device.FriendlyName,
                        Flow = "Capture",
                        IsHfp = IsHfpDevice(device.FriendlyName, device.ID)
                    });
                }
            }
            catch (Exception ex)
            {
                DiagnosticsManager.LogException(ex, "GetDevices");
            }
            return result;
        }

        public static bool IsHfpDevice(string friendlyName, string deviceId)
        {
            string nameLower = friendlyName.ToLower();
            string idLower = deviceId.ToLower();
            
            return nameLower.Contains("hands-free") || 
                   nameLower.Contains("ag audio") || 
                   nameLower.Contains("bluetooth audio") || 
                   nameLower.Contains("hfp") || 
                   idLower.Contains("bthhfenum");
        }

        private static MMDevice? FindDevice(IEnumerable<MMDevice> devices, string? searchString)
        {
            if (string.IsNullOrEmpty(searchString)) return null;

            // 1. Try to match by ID exactly
            foreach (var device in devices)
            {
                if (device.ID.Equals(searchString, StringComparison.OrdinalIgnoreCase))
                    return device;
            }

            // 2. Try to match by friendly name exactly or as substring
            foreach (var device in devices)
            {
                if (device.FriendlyName.Contains(searchString, StringComparison.OrdinalIgnoreCase))
                    return device;
            }

            return null;
        }

        public static (MMDevice? phoneInput, MMDevice? phoneOutput, MMDevice? pcInput, MMDevice? pcOutput) GetOptimalEndpoints(
            string? preferredPhoneInput = null,
            string? preferredPhoneOutput = null,
            string? preferredPcInput = null,
            string? preferredPcOutput = null)
        {
            MMDevice? phoneInput = null;
            MMDevice? phoneOutput = null;
            MMDevice? pcInput = null;
            MMDevice? pcOutput = null;

            try
            {
                var enumerator = new MMDeviceEnumerator();
                var captureDevices = enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active);
                var renderDevices = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active);

                // 1. Resolve phone input (HFP Capture)
                if (!string.IsNullOrEmpty(preferredPhoneInput) && preferredPhoneInput != "auto")
                {
                    phoneInput = FindDevice(captureDevices, preferredPhoneInput);
                }
                if (phoneInput == null)
                {
                    foreach (var device in captureDevices)
                    {
                        if (IsHfpDevice(device.FriendlyName, device.ID))
                        {
                            phoneInput = device;
                            break;
                        }
                    }
                }

                // 2. Resolve phone output (HFP Render)
                if (!string.IsNullOrEmpty(preferredPhoneOutput) && preferredPhoneOutput != "auto")
                {
                    phoneOutput = FindDevice(renderDevices, preferredPhoneOutput);
                }
                if (phoneOutput == null)
                {
                    foreach (var device in renderDevices)
                    {
                        if (IsHfpDevice(device.FriendlyName, device.ID))
                        {
                            phoneOutput = device;
                            break;
                        }
                    }
                }

                // 3. Resolve PC input (PC Capture / Microphone)
                if (!string.IsNullOrEmpty(preferredPcInput) && preferredPcInput != "auto")
                {
                    pcInput = FindDevice(captureDevices, preferredPcInput);
                }
                if (pcInput == null)
                {
                    try { pcInput = enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications); } catch {}
                }
                if (pcInput == null || (phoneInput != null && pcInput.ID == phoneInput.ID))
                {
                    foreach (var device in captureDevices)
                    {
                        if (phoneInput == null || device.ID != phoneInput.ID)
                        {
                            if (!IsHfpDevice(device.FriendlyName, device.ID))
                            {
                                pcInput = device;
                                break;
                            }
                        }
                    }
                }

                // 4. Resolve PC output (PC Render / Speaker)
                if (!string.IsNullOrEmpty(preferredPcOutput) && preferredPcOutput != "auto")
                {
                    pcOutput = FindDevice(renderDevices, preferredPcOutput);
                }
                if (pcOutput == null)
                {
                    try { pcOutput = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Communications); } catch {}
                }
                if (pcOutput == null || (phoneOutput != null && pcOutput.ID == phoneOutput.ID))
                {
                    foreach (var device in renderDevices)
                    {
                        if (phoneOutput == null || device.ID != phoneOutput.ID)
                        {
                            if (!IsHfpDevice(device.FriendlyName, device.ID))
                            {
                                pcOutput = device;
                                break;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                DiagnosticsManager.LogException(ex, "GetOptimalEndpoints");
            }

            return (phoneInput, phoneOutput, pcInput, pcOutput);
        }
    }
}
