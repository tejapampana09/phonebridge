using System;
using System.IO;

namespace phonebridge_native
{
    public static class DiagnosticsManager
    {
        private static readonly string LogFilePath;

        static DiagnosticsManager()
        {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string logDir = Path.Combine(appData, "PhoneBridge");
            try
            {
                Directory.CreateDirectory(logDir);
            }
            catch
            {
                // In case Directory.CreateDirectory fails, fall back to current directory
                logDir = AppDomain.CurrentDomain.BaseDirectory;
            }
            LogFilePath = Path.Combine(logDir, "native-service.log");
        }

        public static void Log(string message, string level = "INFO")
        {
            try
            {
                string logLine = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [{level}] {message}";
                File.AppendAllText(LogFilePath, logLine + Environment.NewLine);
                Console.Error.WriteLine(logLine);
            }
            catch
            {
                // Ignore log failures to avoid crashing the service
            }
        }

        public static void LogException(Exception ex, string context)
        {
            Log($"{context}: {ex.Message}{Environment.NewLine}{ex.StackTrace}", "ERROR");
        }
    }
}
