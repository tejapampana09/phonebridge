using System;
using System.Text.Json;
using System.Threading.Tasks;

namespace phonebridge_native
{
    class CommandRequest
    {
        public string command { get; set; } = string.Empty;
        public JsonElement? args { get; set; }
    }

    class CommandResponse
    {
        public string status { get; set; } = "success";
        public string command { get; set; } = string.Empty;
        public object? data { get; set; }
        public string? error { get; set; }
    }

    class Program
    {
        static async Task Main(string[] args)
        {
            DiagnosticsManager.Log("PhoneBridge Native Service started.");
            
            // Set up console encoding to ensure UTF-8
            Console.InputEncoding = System.Text.Encoding.UTF8;
            Console.OutputEncoding = System.Text.Encoding.UTF8;

            while (true)
            {
                string? line = null;
                try
                {
                    line = Console.ReadLine();
                    if (line == null)
                    {
                        DiagnosticsManager.Log("stdin closed, exiting native service.");
                        break;
                    }

                    line = line.Trim();
                    if (string.IsNullOrEmpty(line))
                        continue;

                    var request = JsonSerializer.Deserialize<CommandRequest>(line);
                    if (request == null || string.IsNullOrEmpty(request.command))
                    {
                        SendError(string.Empty, "Invalid request structure");
                        continue;
                    }

                    await ProcessCommandAsync(request);
                }
                catch (Exception ex)
                {
                    DiagnosticsManager.LogException(ex, "MainLoopException");
                    SendError(line ?? string.Empty, $"Internal error: {ex.Message}");
                }
            }

            // Cleanup
            try
            {
                CallAudioManager.StopRouting();
            }
            catch {}
            DiagnosticsManager.Log("PhoneBridge Native Service stopped.");
        }

        private static async Task ProcessCommandAsync(CommandRequest request)
        {
            var cmd = request.command.ToUpper();
            try
            {
                switch (cmd)
                {
                    case "PING":
                        SendSuccess(cmd, new { message = "PONG" });
                        break;

                    case "START_PAIRING":
                        PairingManager.OpenBluetoothSettings();
                        SendSuccess(cmd, new { message = "Settings opened" });
                        break;

                    case "GET_CALLING_STATUS":
                        var statusData = await GetCallingStatusDataAsync();
                        SendSuccess(cmd, statusData);
                        break;

                    case "LIST_DEVICES":
                        var devices = AudioDeviceManager.GetDevices();
                        SendSuccess(cmd, new { devices });
                        break;

                    case "START_AUDIO_ROUTING":
                        string? phoneIn = null;
                        string? phoneOut = null;
                        string? pcIn = null;
                        string? pcOut = null;

                        if (request.args.HasValue)
                        {
                            var argsObj = request.args.Value;
                            if (argsObj.TryGetProperty("phoneInputId", out var propPhoneIn)) phoneIn = propPhoneIn.GetString();
                            if (argsObj.TryGetProperty("phoneOutputId", out var propPhoneOut)) phoneOut = propPhoneOut.GetString();
                            if (argsObj.TryGetProperty("pcInputId", out var propPcIn)) pcIn = propPcIn.GetString();
                            if (argsObj.TryGetProperty("pcOutputId", out var propPcOut)) pcOut = propPcOut.GetString();
                        }

                        CallAudioManager.StartRouting(phoneIn, phoneOut, pcIn, pcOut);
                        SendSuccess(cmd, new { message = "Audio routing started", active = true });
                        break;

                    case "STOP_AUDIO_ROUTING":
                        CallAudioManager.StopRouting();
                        SendSuccess(cmd, new { message = "Audio routing stopped", active = false });
                        break;

                    case "SET_MUTE":
                        bool mute = false;
                        if (request.args.HasValue)
                        {
                            var argsObj = request.args.Value;
                            if (argsObj.TryGetProperty("muted", out var propMute)) mute = propMute.GetBoolean();
                        }
                        CallAudioManager.SetMute(mute);
                        SendSuccess(cmd, new { muted = CallAudioManager.GetMute() });
                        break;

                    default:
                        SendError(cmd, $"Unknown command: {cmd}");
                        break;
                }
            }
            catch (Exception ex)
            {
                DiagnosticsManager.LogException(ex, $"ProcessCommand:{cmd}");
                SendError(cmd, ex.Message);
            }
        }

        private static async Task<object> GetCallingStatusDataAsync()
        {
            var paired = await PairingManager.GetPairedDevicesAsync();
            
            bool hfpVerified = false;
            string connectedPhoneName = string.Empty;
            string connectedPhoneId = string.Empty;

            foreach (var dev in paired)
            {
                if (dev.IsConnected)
                {
                    connectedPhoneName = dev.Name;
                    connectedPhoneId = dev.Id;
                    hfpVerified = await HfpManager.VerifyHfpSupportAsync(dev.Id);
                    break;
                }
            }

            var (phoneInput, phoneOutput, pcInput, pcOutput) = AudioDeviceManager.GetOptimalEndpoints();

            return new
            {
                pairedDevices = paired,
                connectedPhone = new
                {
                    name = connectedPhoneName,
                    id = connectedPhoneId,
                    hfpVerified = hfpVerified
                },
                audioDevices = new
                {
                    phoneInput = phoneInput != null ? new { id = phoneInput.ID, name = phoneInput.FriendlyName } : null,
                    phoneOutput = phoneOutput != null ? new { id = phoneOutput.ID, name = phoneOutput.FriendlyName } : null,
                    pcInput = pcInput != null ? new { id = pcInput.ID, name = pcInput.FriendlyName } : null,
                    pcOutput = pcOutput != null ? new { id = pcOutput.ID, name = pcOutput.FriendlyName } : null
                },
                audioRoutingActive = CallAudioManager.IsRoutingActive,
                isMuted = CallAudioManager.GetMute()
            };
        }

        private static void SendSuccess(string command, object data)
        {
            var response = new CommandResponse
            {
                status = "success",
                command = command,
                data = data
            };
            Console.WriteLine(JsonSerializer.Serialize(response));
        }

        private static void SendError(string command, string errorMessage)
        {
            var response = new CommandResponse
            {
                status = "error",
                command = command,
                error = errorMessage
            };
            Console.WriteLine(JsonSerializer.Serialize(response));
        }
    }
}
