using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using System.Net;
using System.Net.Sockets;
using Windows.Devices.Bluetooth;
using Windows.Devices.Enumeration;

namespace phonebridge_native
{
    class CommandRequest
    {
        public string command { get; set; } = string.Empty;
        public string? requestId { get; set; }
        public JsonElement? args { get; set; }
    }

    class CommandResponse
    {
        public string status { get; set; } = "success";
        public string command { get; set; } = string.Empty;
        public string? requestId { get; set; }
        public object? data { get; set; }
        public string? error { get; set; }
    }

    class DeviceSettings
    {
        public string lastConnectedDeviceId { get; set; } = string.Empty;
        public string lastConnectedDeviceName { get; set; } = string.Empty;
    }

    class Program
    {
        static async Task Main(string[] args)
        {
            await Task.Yield();
            DiagnosticsManager.Log("PhoneBridge Native Helper started.");
            
            // Set up console encoding to ensure UTF-8
            Console.InputEncoding = System.Text.Encoding.UTF8;
            Console.OutputEncoding = System.Text.Encoding.UTF8;

            // 1. Startup Flow - Load saved device information
            var settings = LoadSettings();
            string savedId = settings.lastConnectedDeviceId;

            // 2. Enumerate paired Bluetooth devices & HFP connection trigger
            _ = Task.Run(async () =>
            {
                try
                {
                    DiagnosticsManager.Log("Executing startup Bluetooth HFP connection flow...");
                    var paired = await PairingManager.GetPairedDevicesAsync();
                    
                    bool connectedAny = false;

                    if (!string.IsNullOrEmpty(savedId))
                    {
                        var target = paired.FirstOrDefault(d => d.Id == savedId);
                        if (target != null)
                        {
                            DiagnosticsManager.Log($"Found saved device '{target.Name}'. Attempting auto-connection...");
                            connectedAny = await HfpManager.ConnectHfpAsync(savedId);
                        }
                    }

                    if (!connectedAny)
                    {
                        // If saved device not found/failed, find first paired phone with HFP support
                        foreach (var dev in paired)
                        {
                            bool supportsHfp = await HfpManager.VerifyHfpSupportAsync(dev.Id, BluetoothCacheMode.Cached);
                            if (supportsHfp)
                            {
                                DiagnosticsManager.Log($"Auto-connecting HFP to first capable device: '{dev.Name}'");
                                bool success = await HfpManager.ConnectHfpAsync(dev.Id);
                                if (success)
                                {
                                    SaveSettings(new DeviceSettings
                                    {
                                        lastConnectedDeviceId = dev.Id,
                                        lastConnectedDeviceName = dev.Name
                                    });
                                    break;
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    DiagnosticsManager.LogException(ex, "StartupHfpFlow");
                }
            });

            // 3. Start Auto Reconnect Loop
            _ = Task.Run(RunAutoReconnectLoopAsync);

            // 4. Start TCP Server on port 5050
            _ = Task.Run(StartTcpServerAsync);

            // 5. Run Stdin/Stdout command parser main loop
            while (true)
            {
                string? line = null;
                try
                {
                    line = Console.ReadLine();
                    if (line == null)
                    {
                        DiagnosticsManager.Log("stdin closed, exiting helper service.");
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

                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            var responseData = await ProcessCommandInternalAsync(request);
                            SendSuccess(request.command, responseData, request.requestId);
                        }
                        catch (Exception ex)
                        {
                            DiagnosticsManager.LogException(ex, $"ProcessConsoleCommand:{request.command}");
                            SendError(request.command, ex.Message, request.requestId);
                        }
                    });
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
            DiagnosticsManager.Log("PhoneBridge Native Helper stopped.");
        }

        private static async Task StartTcpServerAsync()
        {
            try
            {
                var listener = new TcpListener(IPAddress.Loopback, 5050);
                listener.Start();
                DiagnosticsManager.Log("TCP IPC server listening on localhost:5050");
                while (true)
                {
                    var client = await listener.AcceptTcpClientAsync();
                    _ = Task.Run(() => HandleTcpClientAsync(client));
                }
            }
            catch (Exception ex)
            {
                DiagnosticsManager.LogException(ex, "StartTcpServerAsync");
            }
        }

        private static async Task HandleTcpClientAsync(TcpClient client)
        {
            DiagnosticsManager.Log("TCP Client connected to helper IPC.");
            using (client)
            using (var stream = client.GetStream())
            using (var reader = new StreamReader(stream, System.Text.Encoding.UTF8))
            using (var writer = new StreamWriter(stream, System.Text.Encoding.UTF8) { AutoFlush = true })
            {
                while (true)
                {
                    string? line = null;
                    try
                    {
                        line = await reader.ReadLineAsync();
                        if (line == null) break;

                        line = line.Trim();
                        if (string.IsNullOrEmpty(line)) continue;

                        var request = JsonSerializer.Deserialize<CommandRequest>(line);
                        if (request == null || string.IsNullOrEmpty(request.command))
                        {
                            await writer.WriteLineAsync(JsonSerializer.Serialize(new { success = false, error = "Invalid request structure" }));
                            continue;
                        }

                        var responseData = await ProcessCommandInternalAsync(request);
                        await writer.WriteLineAsync(JsonSerializer.Serialize(responseData));
                    }
                    catch (Exception ex)
                    {
                        DiagnosticsManager.LogException(ex, $"HandleTcpClientCommand:{line}");
                        await writer.WriteLineAsync(JsonSerializer.Serialize(new { success = false, error = ex.Message }));
                    }
                }
            }
            DiagnosticsManager.Log("TCP Client disconnected from helper IPC.");
        }

        private static async Task<object> ProcessCommandInternalAsync(CommandRequest request)
        {
            var cmd = request.command.ToUpper();
            switch (cmd)
            {
                case "PING":
                    return new { message = "PONG" };

                case "GET_AUDIO_DEVICES":
                case "GET_AUDIO_DEVS":
                    return AudioDeviceManager.GetDevices();

                case "LISTDEVICES":
                case "LIST_DEVICES":
                    return await ListBluetoothDevicesAsync();

                case "CONNECTHFP":
                case "CONNECT_HFP":
                    string? connId = GetStringArg(request.args, "deviceId");
                    if (string.IsNullOrEmpty(connId))
                        throw new ArgumentException("Missing deviceId arg");
                    
                    bool success = await HfpManager.ConnectHfpAsync(connId);
                    if (success)
                    {
                        var paired = await PairingManager.GetPairedDevicesAsync();
                        var dev = paired.FirstOrDefault(d => d.Id == connId);
                        SaveSettings(new DeviceSettings
                        {
                            lastConnectedDeviceId = connId,
                            lastConnectedDeviceName = dev?.Name ?? "Unknown"
                        });
                    }
                    return new { success };

                case "DISCONNECTHFP":
                case "DISCONNECT_HFP":
                    // Stop routing and clear settings
                    try { CallAudioManager.StopRouting(); } catch {}
                    SaveSettings(new DeviceSettings());
                    return new { success = true };

                case "GETHFPSTATUS":
                case "GET_HFP_STATUS":
                    return await GetHfpStatusAsync();

                case "START_AUDIO_ROUTING":
                    string? phoneIn = GetStringArg(request.args, "phoneInputId");
                    string? phoneOut = GetStringArg(request.args, "phoneOutputId");
                    string? pcIn = GetStringArg(request.args, "pcInputId");
                    string? pcOut = GetStringArg(request.args, "pcOutputId");
                    CallAudioManager.StartRouting(phoneIn, phoneOut, pcIn, pcOut);
                    return new { message = "Audio routing started", active = true };

                case "STOP_AUDIO_ROUTING":
                    CallAudioManager.StopRouting();
                    return new { message = "Audio routing stopped", active = false };

                case "SET_MUTE":
                    bool mute = false;
                    if (request.args.HasValue && request.args.Value.TryGetProperty("muted", out var propMute))
                    {
                        mute = propMute.GetBoolean();
                    }
                    CallAudioManager.SetMute(mute);
                    return new { muted = CallAudioManager.GetMute() };

                case "START_PAIRING":
                    PairingManager.OpenBluetoothSettings();
                    return new { message = "Settings opened" };

                default:
                    throw new ArgumentException($"Unknown command: {cmd}");
            }
        }

        private static async Task<object> ListBluetoothDevicesAsync()
        {
            var result = new System.Collections.Generic.List<object>();
            try
            {
                string selector = BluetoothDevice.GetDeviceSelectorFromPairingState(true);
                var devices = await DeviceInformation.FindAllAsync(selector);
                foreach (var device in devices)
                {
                    bool isPhone = false;
                    bool isConnected = false;
                    bool hfpSupported = false;

                    try
                    {
                        using (var btDevice = await BluetoothDevice.FromIdAsync(device.Id))
                        {
                            if (btDevice != null)
                            {
                                isPhone = btDevice.ClassOfDevice.MajorClass == BluetoothMajorClass.Phone;
                                isConnected = btDevice.ConnectionStatus == BluetoothConnectionStatus.Connected;
                                hfpSupported = await HfpManager.VerifyHfpSupportAsync(device.Id, BluetoothCacheMode.Cached);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        DiagnosticsManager.Log($"Error inspecting device '{device.Name}' ({device.Id}): {ex.Message}", "WARNING");
                    }

                    if (isPhone || hfpSupported)
                    {
                        result.Add(new
                        {
                            id = device.Id,
                            name = device.Name,
                            paired = true,
                            hfpSupported = hfpSupported,
                            connected = isConnected
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                DiagnosticsManager.LogException(ex, "ListBluetoothDevicesAsync");
            }
            return result;
        }

        private static async Task<object> GetHfpStatusAsync()
        {
            var settings = LoadSettings();
            bool isConnected = false;
            string deviceName = string.Empty;

            if (!string.IsNullOrEmpty(settings.lastConnectedDeviceId))
            {
                try
                {
                    using (var btDevice = await BluetoothDevice.FromIdAsync(settings.lastConnectedDeviceId))
                    {
                        if (btDevice != null)
                        {
                            isConnected = btDevice.ConnectionStatus == BluetoothConnectionStatus.Connected;
                            deviceName = btDevice.Name;
                        }
                    }
                }
                catch
                {
                    isConnected = false;
                }
            }

            return new
            {
                connected = isConnected,
                device = isConnected ? deviceName : null,
                deviceId = isConnected ? settings.lastConnectedDeviceId : null
            };
        }

        static async Task RunAutoReconnectLoopAsync()
        {
            DiagnosticsManager.Log("Auto-reconnect loop running.");
            while (true)
            {
                await Task.Delay(8000);
                try
                {
                    var settings = LoadSettings();
                    if (!string.IsNullOrEmpty(settings.lastConnectedDeviceId))
                    {
                        bool isConnected = false;
                        using (var btDevice = await BluetoothDevice.FromIdAsync(settings.lastConnectedDeviceId))
                        {
                            if (btDevice != null)
                            {
                                isConnected = btDevice.ConnectionStatus == BluetoothConnectionStatus.Connected;
                            }
                        }

                        if (!isConnected)
                        {
                            DiagnosticsManager.Log($"Device '{settings.lastConnectedDeviceName}' disconnected. Auto-reconnecting HFP...", "INFO");
                            await HfpManager.ConnectHfpAsync(settings.lastConnectedDeviceId);
                        }
                    }
                }
                catch (Exception ex)
                {
                    DiagnosticsManager.LogException(ex, "AutoReconnectLoop");
                }
            }
        }

        // ──────────────────────────────────────────────────────────────────────────
        // Settings Helpers
        // ──────────────────────────────────────────────────────────────────────────

        private static string GetSettingsPath()
        {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string pbDir = Path.Combine(appData, "PhoneBridge");
            try
            {
                Directory.CreateDirectory(pbDir);
            }
            catch {}
            return Path.Combine(pbDir, "device_config.json");
        }

        private static DeviceSettings LoadSettings()
        {
            try
            {
                string path = GetSettingsPath();
                if (File.Exists(path))
                {
                    string json = File.ReadAllText(path);
                    return JsonSerializer.Deserialize<DeviceSettings>(json) ?? new DeviceSettings();
                }
            }
            catch (Exception ex)
            {
                DiagnosticsManager.LogException(ex, "LoadSettings");
            }
            return new DeviceSettings();
        }

        private static void SaveSettings(DeviceSettings settings)
        {
            try
            {
                string path = GetSettingsPath();
                string json = JsonSerializer.Serialize(settings);
                File.WriteAllText(path, json);
            }
            catch (Exception ex)
            {
                DiagnosticsManager.LogException(ex, "SaveSettings");
            }
        }

        private static string? GetStringArg(JsonElement? args, string propName)
        {
            if (args.HasValue && args.Value.TryGetProperty(propName, out var prop))
            {
                return prop.GetString();
            }
            return null;
        }

        private static void SendSuccess(string command, object data, string? requestId = null)
        {
            var response = new CommandResponse
            {
                status = "success",
                command = command,
                requestId = requestId,
                data = data
            };
            Console.WriteLine(JsonSerializer.Serialize(response));
        }

        private static void SendError(string command, string errorMessage, string? requestId = null)
        {
            var response = new CommandResponse
            {
                status = "error",
                command = command,
                requestId = requestId,
                error = errorMessage
            };
            Console.WriteLine(JsonSerializer.Serialize(response));
        }
    }
}
