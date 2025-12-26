using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text.Json;

namespace Jellyfin.Orsay.Installer.Services
{
    public static class LocalizationService
    {
        private static Dictionary<string, string> _strings = new();
        public static event Action? LanguageChanged;

        public static void SetLanguage(string code)
        {
            var assembly = Assembly.GetExecutingAssembly();
            var resourceName = $"Jellyfin.Orsay.Installer.Resources.Languages.{code}.json";

            using var stream = assembly.GetManifestResourceStream(resourceName);
            if (stream == null)
            {
                throw new FileNotFoundException($"Language file not found: {code}.json");
            }

            using var reader = new StreamReader(stream);
            var json = reader.ReadToEnd();
            _strings = JsonSerializer.Deserialize<Dictionary<string, string>>(json)
                       ?? new Dictionary<string, string>();

            CultureInfo.CurrentUICulture = new CultureInfo(code);
            LanguageChanged?.Invoke();
        }

        public static string GetString(string key)
        {
            return _strings.TryGetValue(key, out var value) ? value : key;
        }
    }
}