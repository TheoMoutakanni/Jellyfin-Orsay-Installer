using System;
using System.IO;
using System.Text.Json;

namespace Jellyfin.Orsay.Installer.Services
{
    public static class SettingsService
    {
        private static readonly string Path = System.IO.Path.Combine(AppContext.BaseDirectory, "settings.json");

        public static string LoadLanguage()
        {
            if (!File.Exists(Path))
                return "en";

            var json = File.ReadAllText(Path);
            return JsonSerializer.Deserialize<Settings>(json)?.Language ?? "en";
        }

        public static void SaveLanguage(string lang)
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path)!);
            File.WriteAllText(Path, JsonSerializer.Serialize(new Settings { Language = lang }));
        }

        private class Settings
        {
            public string Language { get; set; } = "en";
        }
    }
}