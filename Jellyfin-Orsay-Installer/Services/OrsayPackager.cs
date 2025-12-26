using System;
using System.IO;
using System.Text;

namespace Jellyfin.Orsay.Installer.Services
{
    public sealed class OrsayPackager
    {
        private readonly string _templateRoot;

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


        public void BuildWidget(string outputRoot, string appName, string version)
        {
            var orsay = Path.Combine(outputRoot, "orsay");
            var widget = Path.Combine(orsay, appName);

            if (Directory.Exists(widget))
                Directory.Delete(widget, true);

            Directory.CreateDirectory(widget);

            CopyDir(Path.Combine(_templateRoot, "Jellyfin"), widget);

            var template = Path.Combine(widget, "config.xml.template");
            var config = File.ReadAllText(template)
                .Replace("{{APP_NAME}}", appName)
                .Replace("{{VERSION}}", version);

            File.WriteAllText(Path.Combine(widget, "config.xml"), config, Encoding.UTF8);
            File.Delete(template);

            File.WriteAllText(Path.Combine(orsay, "widgetlist.xml"),
    $"""
<?xml version="1.0" encoding="UTF-8"?>
<widgetlist>
  <widget>
    <name>{appName}</name>
    <version>{version}</version>
    <content>{appName}</content>
  </widget>
</widgetlist>
""", Encoding.UTF8);
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