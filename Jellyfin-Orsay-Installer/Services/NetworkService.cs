using System.Linq;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace Jellyfin.Orsay.Installer.Services
{
    public sealed class NetworkService
    {
        public string? GetBestLocalIPv4()
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up)
                .SelectMany(n => n.GetIPProperties().UnicastAddresses)
                .Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork)
                .Select(a => a.Address.ToString())
                .FirstOrDefault();
        }
    }
}