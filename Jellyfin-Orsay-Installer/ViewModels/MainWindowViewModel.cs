using Jellyfin.Orsay.Installer.Services;
using System;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Windows.Input;

namespace Jellyfin.Orsay.Installer.ViewModels
{
    public sealed class MainWindowViewModel : ViewModelBase
    {
        // ===== Localization =====
        public ObservableCollection<string> Languages { get; } = new() { "en", "nl" };
        public LocalizationViewModel L { get; } = new();

        private string _selectedLanguage = SettingsService.LoadLanguage();
        public string SelectedLanguage
        {
            get => _selectedLanguage;
            set
            {
                if (_selectedLanguage == value) return;

                _selectedLanguage = value;
                LocalizationService.SetLanguage(value);
                SettingsService.SaveLanguage(value);

                OnPropertyChanged();
                OnPropertyChanged(nameof(InstallStatus));
            }
        }

        // ===== Services =====
        private readonly NetworkService _network = new();
        private readonly OrsayPackager _packager;
        private KestrelOrsayServer? _server;

        // ===== Installation state =====
        private bool _installed;
        public bool IsInstallDone => _installed;

        private bool _sawWidgetList;
        private bool _sawWidgetFiles;

        // ===== UI state =====
        private int _requests;
        private string _lastRequest = "—";
        private string _logs = "";

        public int RequestsCount => _requests;
        public string LastRequestText => _lastRequest;
        public string Logs => _logs;

        public string InstallStatus =>
            _installed
                ? LocalizationService.GetString("Install.Done")
                : LocalizationService.GetString("Install.Waiting");

        // ✅ THIS WAS MISSING
        public bool CanBuildAndStart => _server == null && !_installed;

        // ===== Commands =====
        public ICommand BuildAndStartCommand { get; }
        public ICommand BuyMeABeerCommand { get; }
        public ICommand CloseCommand { get; }

        public event Action? CloseRequested;

        // ===== Info =====
        public string LocalIp { get; }
        public string OutputPath { get; }
        public int Port { get; } = 8000;

        // ===== Constructor =====
        public MainWindowViewModel()
        {
            LocalIp = _network.GetBestLocalIPv4() ?? "127.0.0.1";
            _packager = new OrsayPackager(AppContext.BaseDirectory + "Template");
            OutputPath = _packager.GetDefaultOutputPath();

            BuildAndStartCommand = new AsyncRelayCommand(BuildAndStartAsync);
            BuyMeABeerCommand = new RelayCommand(OpenKoFi);
            CloseCommand = new RelayCommand(() => CloseRequested?.Invoke());
        }

        // ===== Commands =====
        private async Task BuildAndStartAsync()
        {
            AppendLog("Packaging widget...");
            _packager.BuildWidget(OutputPath, "Jellyfin", "1.0.0");

            AppendLog("Starting server...");
            _server = new KestrelOrsayServer(OutputPath, Port);
            _server.OnRequest += HandleRequest;
            _server.OnLog += AppendLog;
            _server.Start();

            OnPropertyChanged(nameof(CanBuildAndStart));
        }

        private void OpenKoFi()
        {
            var psi = new ProcessStartInfo
            {
                FileName = "https://ko-fi.com/patrickst",
                UseShellExecute = true
            };
            Process.Start(psi);
        }

        // ===== Server callbacks =====
        private void HandleRequest(string path)
        {
            _requests++;
            _lastRequest = path;

            if (path.EndsWith("widgetlist.xml"))
                _sawWidgetList = true;

            if (path.Contains("/Jellyfin/"))
                _sawWidgetFiles = true;

            if (!_installed && _sawWidgetList && _sawWidgetFiles)
            {
                _installed = true;

                OnPropertyChanged(nameof(IsInstallDone));
                OnPropertyChanged(nameof(InstallStatus));
                OnPropertyChanged(nameof(CanBuildAndStart));
            }

            Notify();
        }

        // ===== Helpers =====
        private void AppendLog(string msg)
        {
            _logs += $"[{DateTime.Now:HH:mm:ss}] {msg}\n";
            Notify();
        }

        private void Notify()
        {
            OnPropertyChanged(nameof(RequestsCount));
            OnPropertyChanged(nameof(LastRequestText));
            OnPropertyChanged(nameof(Logs));
        }
    }

    internal sealed class AsyncRelayCommand : ICommand
    {
        private readonly Func<Task> _execute;
        public AsyncRelayCommand(Func<Task> execute) => _execute = execute;
        public event EventHandler? CanExecuteChanged;
        public bool CanExecute(object? parameter) => true;
        public async void Execute(object? parameter) => await _execute();
    }

    internal sealed class RelayCommand : ICommand
    {
        private readonly Action _execute;
        public RelayCommand(Action execute) => _execute = execute;
        public event EventHandler? CanExecuteChanged;
        public bool CanExecute(object? parameter) => true;
        public void Execute(object? parameter) => _execute();
    }
}
