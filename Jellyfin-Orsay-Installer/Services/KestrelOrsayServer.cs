using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using System;
using System.Collections.Generic;

namespace Jellyfin.Orsay.Installer.Services
{
    public sealed class KestrelOrsayServer : IDisposable
    {
        private IHost? _host;
        private readonly string _root;
        private readonly int[] _ports;

        public event Action<string>? OnRequest;
        public event Action<string>? OnLog;

        public KestrelOrsayServer(string root, params int[] ports)
        {
            _root = root;
            _ports = ports;
        }

        public void Start()
        {
            var boundPorts = new List<int>();

            _host = Host.CreateDefaultBuilder()
                .ConfigureWebHostDefaults(w =>
                {
                    w.UseKestrel(options =>
                     {
                         foreach (var port in _ports)
                         {
                             try
                             {
                                 options.ListenAnyIP(port);
                                 boundPorts.Add(port);
                             }
                             catch (Exception)
                             {
                                 OnLog?.Invoke($"Warning: Could not bind port {port} (in use or no permission)");
                             }
                         }
                     })
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
            OnLog?.Invoke($"Server started on port(s) {string.Join(", ", boundPorts)}");
        }

        public void Dispose()
        {
            _host?.StopAsync().Wait(500);
            _host?.Dispose();
        }
    }
}
