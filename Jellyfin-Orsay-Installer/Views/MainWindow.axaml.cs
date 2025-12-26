using Avalonia.Controls;
using Jellyfin.Orsay.Installer.ViewModels;

namespace Jellyfin.Orsay.Installer.Views
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
        }

        private void Window_Opened(object? sender, System.EventArgs e)
        {
            if (DataContext is MainWindowViewModel vm)
            {
                vm.CloseRequested += Close;
            }
        }
    }
}
