using Jellyfin.Orsay.Installer.Services;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace Jellyfin.Orsay.Installer.ViewModels
{
    public sealed class LocalizationViewModel : INotifyPropertyChanged
    {
        public event PropertyChangedEventHandler? PropertyChanged;

        public LocalizationViewModel()
        {
            LocalizationService.LanguageChanged += () =>
                OnPropertyChanged(string.Empty); // refresh ALL strings
        }

        public string this[string key] =>
            LocalizationService.GetString(key);

        private void OnPropertyChanged([CallerMemberName] string? name = null)
            => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
