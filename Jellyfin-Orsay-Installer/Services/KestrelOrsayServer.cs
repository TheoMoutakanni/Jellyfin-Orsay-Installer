using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
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
                         app.Use(async (ctx, next) =>
                         {
                             OnRequest?.Invoke(ctx.Request.Path);
                             await next();
                         });

                         app.UseStaticFiles(new StaticFileOptions
                         {
                             FileProvider = new PhysicalFileProvider(_root),
                             ServeUnknownFileTypes = true
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