using System;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace phonebridge_native
{
    public static class CallAudioManager
    {
        private static AudioRoute? pcToPhoneRoute;
        private static AudioRoute? phoneToPcRoute;
        private static bool isMuted = false;
        private static readonly object lockObj = new object();

        public static bool IsRoutingActive { get; private set; }

        public static void StartRouting(
            string? preferredPhoneInputId = null,
            string? preferredPhoneOutputId = null,
            string? preferredPcInputId = null,
            string? preferredPcOutputId = null)
        {
            lock (lockObj)
            {
                if (IsRoutingActive)
                {
                    DiagnosticsManager.Log("Audio routing is already active.");
                    return;
                }

                DiagnosticsManager.Log("Resolving optimal audio endpoints...");
                var (phoneInput, phoneOutput, pcInput, pcOutput) = AudioDeviceManager.GetOptimalEndpoints(
                    preferredPhoneInputId, preferredPhoneOutputId, preferredPcInputId, preferredPcOutputId
                );

                if (phoneInput == null || phoneOutput == null || pcInput == null || pcOutput == null)
                {
                    string missing = $"phoneInput: {phoneInput != null}, phoneOutput: {phoneOutput != null}, pcInput: {pcInput != null}, pcOutput: {pcOutput != null}";
                    throw new InvalidOperationException($"Could not resolve all required endpoints for routing: {missing}");
                }

                DiagnosticsManager.Log($"Starting bidirectional routing: {Environment.NewLine}" +
                                       $"  PC Input (Mic): {pcInput.FriendlyName}{Environment.NewLine}" +
                                       $"  Phone Output (Hands-Free Playback): {phoneOutput.FriendlyName}{Environment.NewLine}" +
                                       $"  Phone Input (Hands-Free Record): {phoneInput.FriendlyName}{Environment.NewLine}" +
                                       $"  PC Output (Speaker): {pcOutput.FriendlyName}");

                try
                {
                    pcToPhoneRoute = new AudioRoute();
                    pcToPhoneRoute.Start(pcInput, phoneOutput);
                    pcToPhoneRoute.IsMuted = isMuted;

                    phoneToPcRoute = new AudioRoute();
                    phoneToPcRoute.Start(phoneInput, pcOutput);

                    IsRoutingActive = true;
                    DiagnosticsManager.Log("Bidirectional call audio routing successfully started.");
                }
                catch (Exception ex)
                {
                    DiagnosticsManager.LogException(ex, "StartRouting");
                    StopRouting();
                    throw;
                }
            }
        }

        public static void StopRouting()
        {
            lock (lockObj)
            {
                if (!IsRoutingActive)
                {
                    DiagnosticsManager.Log("Audio routing was not active.");
                    return;
                }

                DiagnosticsManager.Log("Stopping bidirectional audio routing...");
                try { pcToPhoneRoute?.Dispose(); } catch (Exception ex) { DiagnosticsManager.LogException(ex, "Stop pcToPhoneRoute"); }
                try { phoneToPcRoute?.Dispose(); } catch (Exception ex) { DiagnosticsManager.LogException(ex, "Stop phoneToPcRoute"); }

                pcToPhoneRoute = null;
                phoneToPcRoute = null;
                IsRoutingActive = false;
                DiagnosticsManager.Log("Bidirectional audio routing stopped.");
            }
        }

        public static void SetMute(bool mute)
        {
            lock (lockObj)
            {
                isMuted = mute;
                if (pcToPhoneRoute != null)
                {
                    pcToPhoneRoute.IsMuted = mute;
                }
                DiagnosticsManager.Log($"Mute status updated to: {mute}");
            }
        }

        public static bool GetMute()
        {
            lock (lockObj)
            {
                return isMuted;
            }
        }

        private class AudioRoute : IDisposable
        {
            private WasapiCapture? capture;
            private WasapiOut? output;
            private BufferedWaveProvider? buffer;
            private MediaFoundationResampler? resampler;

            public bool IsMuted { get; set; }

            public void Start(MMDevice inputDevice, MMDevice outputDevice)
            {
                // Initialize capture
                capture = new WasapiCapture(inputDevice);
                
                // Initialize buffer
                buffer = new BufferedWaveProvider(capture.WaveFormat);
                buffer.DiscardOnBufferOverflow = true;

                // Handle data available
                capture.DataAvailable += (sender, e) =>
                {
                    if (e.BytesRecorded > 0 && buffer != null)
                    {
                        if (IsMuted)
                        {
                            byte[] zeroBuffer = new byte[e.BytesRecorded];
                            buffer.AddSamples(zeroBuffer, 0, e.BytesRecorded);
                        }
                        else
                        {
                            buffer.AddSamples(e.Buffer, 0, e.BytesRecorded);
                        }
                    }
                };

                IWaveProvider providerToPlay = buffer;
                try
                {
                    var mixFormat = outputDevice.AudioClient.MixFormat;
                    if (mixFormat != null && !capture.WaveFormat.Equals(mixFormat))
                    {
                        DiagnosticsManager.Log($"Resampling {inputDevice.FriendlyName} -> {outputDevice.FriendlyName} from {capture.WaveFormat} to {mixFormat}");
                        resampler = new MediaFoundationResampler(buffer, mixFormat);
                        resampler.ResamplerQuality = 60;
                        providerToPlay = resampler;
                    }
                }
                catch (Exception ex)
                {
                    DiagnosticsManager.Log($"Resampling set up failed (using source format): {ex.Message}", "WARNING");
                }

                // Initialize playback
                output = new WasapiOut(outputDevice, AudioClientShareMode.Shared, false, 100);
                output.Init(providerToPlay);

                // Start audio flow
                capture.StartRecording();
                output.Play();
            }

            public void Dispose()
            {
                try { capture?.StopRecording(); } catch {}
                try { output?.Stop(); } catch {}
                try { capture?.Dispose(); } catch {}
                try { output?.Dispose(); } catch {}
                try { resampler?.Dispose(); } catch {}
                
                capture = null;
                output = null;
                buffer = null;
                resampler = null;
            }
        }
    }
}
