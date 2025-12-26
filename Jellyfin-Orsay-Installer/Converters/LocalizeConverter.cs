using Avalonia.Data.Converters;
using Jellyfin.Orsay.Installer.Services;
using System;
using System.Globalization;

namespace Jellyfin.Orsay.Installer.Converters
{
    public class LocalizeConverter : IValueConverter
    {
        public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        {
            if (parameter is string key)
            {
                return LocalizationService.GetString(key);
            }
            return value ?? string.Empty;
        }

        public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}