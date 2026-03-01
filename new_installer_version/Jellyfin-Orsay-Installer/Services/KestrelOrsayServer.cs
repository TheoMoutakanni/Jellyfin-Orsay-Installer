using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Jellyfin.Orsay.Installer.Models;
using Jellyfin.Orsay.Installer.Services.Abstractions;

namespace Jellyfin.Orsay.Installer.Services;

public sealed class KestrelOrsayServer : IOrsayServer
{
    private IHost? _host;
    private string? _root;
    private int _requestCount;
    private string? _lastRequestPath;
    private bool _widgetListRequested;
    private bool _widgetDownloaded;

    public bool IsRunning => _host != null;

    public ServerStatus Status => new()
    {
        IsRunning = IsRunning,
        RequestCount = _requestCount,
        LastRequestPath = _lastRequestPath,
        WidgetListRequested = _widgetListRequested,
        WidgetDownloaded = _widgetDownloaded
    };

    public event Action<ServerRequest>? OnRequest;
    public event Action<string>? OnLog;

    public Task<int> StartAsync(string rootPath, string ip, int[] ports, CancellationToken cancellationToken = default)
    {
        if (_host != null)
            throw new InvalidOperationException("Server is already running");

        _root = rootPath;
        _requestCount = 0;
        _lastRequestPath = null;
        _widgetListRequested = false;
        _widgetDownloaded = false;

        // Try binding with all ports first, then fall back to each port individually
        try
        {
            _host = BuildHost(ports);
            _host.Start();
            OnLog?.Invoke($"Server started on port(s) {string.Join(", ", ports)}");
            return Task.FromResult(ports[0]);
        }
        catch (Exception ex)
        {
            _host?.Dispose();
            _host = null;
            OnLog?.Invoke($"Warning: Could not bind all ports ({ex.Message}). Trying individually...");
        }

        // Try each port individually — use the first one that works
        Exception? lastException = null;
        foreach (var port in ports)
        {
            try
            {
                _host = BuildHost([port]);
                _host.Start();
                OnLog?.Invoke($"Server started on port {port}");
                return Task.FromResult(port);
            }
            catch (Exception ex)
            {
                _host?.Dispose();
                _host = null;
                lastException = ex;
                OnLog?.Invoke($"Warning: Could not bind port {port} ({ex.Message})");
            }
        }

        OnLog?.Invoke($"Error: Could not bind any port.");
        throw lastException ?? new InvalidOperationException("No ports available");
    }

    private IHost BuildHost(int[] ports)
    {
        var urls = ports.Select(p => $"http://0.0.0.0:{p}").ToArray();

        return Host.CreateDefaultBuilder()
            .ConfigureWebHostDefaults(w =>
            {
                w.UseUrls(urls)
                 .Configure(app =>
                 {
                     // Request logging middleware
                     app.Use(async (ctx, next) =>
                     {
                         var request = ctx.Request;

                         // Read body if present (for POST requests), limit to 10KB
                         string? body = null;
                         if (request.ContentLength > 0 && request.ContentLength < 10240)
                         {
                             request.EnableBuffering();
                             using var reader = new StreamReader(request.Body, leaveOpen: true);
                             body = await reader.ReadToEndAsync();
                             request.Body.Position = 0;
                         }

                         var serverRequest = new ServerRequest
                         {
                             Method = request.Method,
                             Path = request.Path.Value ?? "/",
                             Timestamp = DateTime.Now,
                             UserAgent = request.Headers.UserAgent.ToString(),
                             ContentType = request.ContentType,
                             ContentLength = request.ContentLength,
                             Body = body,
                             RemoteIp = ctx.Connection.RemoteIpAddress?.ToString()
                         };

                         HandleRequest(serverRequest);
                         await next();
                     });

                     // Configure MIME types for Samsung Orsay compatibility
                     var contentTypeProvider = new FileExtensionContentTypeProvider();
                     contentTypeProvider.Mappings[".xml"] = "text/xml; charset=utf-8";
                     contentTypeProvider.Mappings[".zip"] = "application/zip";

                     app.UseStaticFiles(new StaticFileOptions
                     {
                         FileProvider = new PhysicalFileProvider(_root!),
                         ServeUnknownFileTypes = true,
                         ContentTypeProvider = contentTypeProvider
                     });
                 });
            })
            .Build();
    }

    private void HandleRequest(ServerRequest request)
    {
        _requestCount++;
        _lastRequestPath = request.Path;

        if (request.Path.EndsWith("widgetlist.xml", StringComparison.OrdinalIgnoreCase))
            _widgetListRequested = true;

        if (request.Path.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            _widgetDownloaded = true;

        OnRequest?.Invoke(request);
    }

    public async Task StopAsync()
    {
        if (_host == null) return;

        try
        {
            await _host.StopAsync(TimeSpan.FromMilliseconds(500));
        }
        catch
        {
            // Ignore stop errors
        }
        finally
        {
            _host.Dispose();
            _host = null;
            OnLog?.Invoke("Server stopped");
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
    }
}
