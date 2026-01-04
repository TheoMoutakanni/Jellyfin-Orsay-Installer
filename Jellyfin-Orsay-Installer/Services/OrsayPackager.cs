using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Xml.Linq;

namespace Jellyfin.Orsay.Installer.Services
{
    public sealed class OrsayPackager
    {
        private readonly string _templateRoot;

        public record BuildResult(string ZipFileName, long ZipSize, string WidgetId);

        public OrsayPackager(string templateRoot)
        {
            _templateRoot = templateRoot;
        }

        public string GetDefaultOutputPath()
        {
            return Path.Combine(
                AppContext.BaseDirectory,
                "assets",
                "orsay-output"
            );
        }

        public BuildResult BuildWidget(string outputRoot, string appName, string localIp, int port)
        {
            // Clean output directory
            if (Directory.Exists(outputRoot))
                Directory.Delete(outputRoot, true);
            Directory.CreateDirectory(outputRoot);

            // Create temp widget folder
            var tempWidget = Path.Combine(outputRoot, "_temp_widget");
            Directory.CreateDirectory(tempWidget);

            // Copy template files
            CopyDir(Path.Combine(_templateRoot, "Jellyfin"), tempWidget);

            // Extract version from config.xml
            var version = ExtractVersion(Path.Combine(tempWidget, "config.xml"));

            // Remove config.xml.template if exists
            var templateFile = Path.Combine(tempWidget, "config.xml.template");
            if (File.Exists(templateFile))
                File.Delete(templateFile);

            // Generate widget ID and ZIP filename
            var dateStamp = DateTime.Now.ToString("yyyyMMdd");
            var widgetId = $"{appName}_{dateStamp}";
            var zipFileName = $"{appName}_v{version}_{dateStamp}.zip";
            var zipPath = Path.Combine(outputRoot, zipFileName);

            // Create ZIP archive
            ZipFile.CreateFromDirectory(tempWidget, zipPath, CompressionLevel.Optimal, false);

            // Get ZIP size
            var zipSize = new FileInfo(zipPath).Length;

            // Clean up temp folder
            Directory.Delete(tempWidget, true);

            // Generate download URL
            var downloadUrl = port == 80
                ? $"http://{localIp}/{zipFileName}"
                : $"http://{localIp}:{port}/{zipFileName}";

            // Generate widgetlist.xml in Samsung Orsay format
            var widgetlistXml = $"""
<?xml version="1.0" encoding="utf-8"?>
<rsp stat="ok">
<list>
<widget id="{widgetId}">
    <title>{widgetId}</title>
    <compression size="{zipSize}" type="zip" />
    <description>Jellyfin Media Player for Samsung Orsay Smart TVs</description>
    <download>{downloadUrl}</download>
</widget>
</list>
</rsp>
""";

            File.WriteAllText(
                Path.Combine(outputRoot, "widgetlist.xml"),
                widgetlistXml,
                new UTF8Encoding(false) // UTF-8 without BOM
            );

            return new BuildResult(zipFileName, zipSize, widgetId);
        }

        private static string ExtractVersion(string configXmlPath)
        {
            try
            {
                var doc = XDocument.Load(configXmlPath);
                var verElement = doc.Root?.Element("ver");
                if (verElement != null)
                    return verElement.Value;
            }
            catch
            {
                // Fallback if parsing fails
            }
            return "1.0.0";
        }

        private static void CopyDir(string src, string dst)
        {
            Directory.CreateDirectory(dst);
            foreach (var f in Directory.GetFiles(src))
                File.Copy(f, Path.Combine(dst, Path.GetFileName(f)), true);
            foreach (var d in Directory.GetDirectories(src))
                CopyDir(d, Path.Combine(dst, Path.GetFileName(d)));
        }
    }
}
