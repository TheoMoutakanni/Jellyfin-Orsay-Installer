using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using System;

namespace Jellyfin.Orsay.Installer.Services
{
    public sealed class KestrelOrsayServer : IDisposable
    {
        private IHost? _host;
        private readonly string _root;
        private readonly int _port;

        public event Action<string>? OnRequest;
        public event Action<string>? OnLog;

        public KestrelOrsayServer(string root, int port)
        {
            _root = root;
            _port = port;
        }

        public void Start()
        {
            _host = Host.CreateDefaultBuilder()
                .ConfigureWebHostDefaults(w =>
                {
                    w.UseUrls($"http://0.0.0.0:{_port}")
                     .Configure(app =>
                     {
                         // Request logging middleware
                         app.Use(async (ctx, next) =>
                         {
                             OnRequest?.Invoke(ctx.Request.Path);
                             await next();
                         });

                         // Configure MIME types for Samsung Orsay compatibility
                         var contentTypeProvider = new FileExtensionContentTypeProvider();
                         contentTypeProvider.Mappings[".xml"] = "text/xml; charset=utf-8";
                         contentTypeProvider.Mappings[".zip"] = "application/zip";

                         app.UseStaticFiles(new StaticFileOptions
                         {
                             FileProvider = new PhysicalFileProvider(_root),
                             ServeUnknownFileTypes = true,
                             ContentTypeProvider = contentTypeProvider
                         });
                     });
                })
                .Build();

            _host.Start();
            OnLog?.Invoke($"Server started on port {_port}");
        }

        public void Dispose()
        {
            _host?.StopAsync().Wait(500);
            _host?.Dispose();
        }
    }
}
