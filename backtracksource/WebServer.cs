using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Diagnostics;

namespace BackTrack
{
    public class WebServer
    {
        private readonly HttpListener _listener = new HttpListener();
        private readonly Tracker _tracker;
        private readonly ClipboardMonitor _clipboardMonitor;
        private readonly SnapshotManager _snapshotManager;
        private readonly int _port;
        private bool _isRunning = false;

        public WebServer(Tracker tracker, ClipboardMonitor clipboardMonitor, SnapshotManager snapshotManager, int port = 8420)
        {
            _tracker = tracker;
            _clipboardMonitor = clipboardMonitor;
            _snapshotManager = snapshotManager;
            _port = port;
            _listener.Prefixes.Add($"http://localhost:{port}/");
        }

        public void Start()
        {
            try
            {
                _listener.Start();
                _isRunning = true;
                Task.Run(() => ListenLoop());
                Debug.WriteLine($"Web server started at http://localhost:{_port}/");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to start web server: {ex.Message}");
            }
        }

        public void Stop()
        {
            _isRunning = false;
            try
            {
                _listener.Stop();
            }
            catch { }
        }

        private async Task ListenLoop()
        {
            while (_isRunning && _listener.IsListening)
            {
                try
                {
                    var context = await _listener.GetContextAsync();
                    _ = Task.Run(() => HandleRequest(context));
                }
                catch (Exception ex)
                {
                    if (!_isRunning) break;
                    Debug.WriteLine($"Listener loop error: {ex.Message}");
                }
            }
        }

        private async Task HandleRequest(HttpListenerContext context)
        {
            var request = context.Request;
            var response = context.Response;

            // CORS headers
            response.Headers.Add("Access-Control-Allow-Origin", "*");
            response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
            response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = (int)HttpStatusCode.OK;
                response.Close();
                return;
            }

            string urlPath = request.Url?.LocalPath.ToLowerInvariant() ?? "/";
            try
            {
                // Serve Web Assets (Embedded resources)
                if (urlPath == "/" || urlPath == "/index.html")
                {
                    await ServeEmbeddedResource(response, "index.html", "text/html; charset=utf-8");
                }
                else if (urlPath == "/style.css")
                {
                    await ServeEmbeddedResource(response, "style.css", "text/css");
                }
                else if (urlPath == "/app.js")
                {
                    await ServeEmbeddedResource(response, "app.js", "application/javascript");
                }
                
                // --- 1. HISTORY API ENDPOINTS ---
                else if (urlPath == "/api/history" && request.HttpMethod == "GET")
                {
                    var history = _tracker.GetHistory();
                    string json = JsonSerializer.Serialize(history);
                    await SendJsonResponse(response, json);
                }
                else if (urlPath == "/api/restore" && request.HttpMethod == "POST")
                {
                    string? id = request.QueryString["id"];
                    if (string.IsNullOrEmpty(id))
                    {
                        await SendError(response, HttpStatusCode.BadRequest, "Missing id parameter");
                    }
                    else
                    {
                        bool success = _tracker.RestoreItem(id);
                        string json = JsonSerializer.Serialize(new { success });
                        await SendJsonResponse(response, json);
                    }
                }
                else if (urlPath == "/api/history" && request.HttpMethod == "DELETE")
                {
                    _tracker.ClearHistory();
                    string json = JsonSerializer.Serialize(new { success = true });
                    await SendJsonResponse(response, json);
                }
                else if (urlPath == "/api/history/delete" && request.HttpMethod == "DELETE")
                {
                    string? id = request.QueryString["id"];
                    if (string.IsNullOrEmpty(id))
                    {
                        await SendError(response, HttpStatusCode.BadRequest, "Missing id parameter");
                    }
                    else
                    {
                        bool success = _tracker.DeleteHistoryItem(id);
                        string json = JsonSerializer.Serialize(new { success });
                        await SendJsonResponse(response, json);
                    }
                }

                // --- 2. PRIVATE MODE API ENDPOINTS ---
                else if (urlPath == "/api/private-mode" && request.HttpMethod == "GET")
                {
                    bool enabled = _tracker.IsPrivateMode;
                    string json = JsonSerializer.Serialize(new { enabled });
                    await SendJsonResponse(response, json);
                }
                else if (urlPath == "/api/private-mode" && request.HttpMethod == "POST")
                {
                    string? enabledStr = request.QueryString["enabled"];
                    if (bool.TryParse(enabledStr, out bool enabled))
                    {
                        _tracker.IsPrivateMode = enabled;
                        _clipboardMonitor.IsPrivateMode = enabled;
                        string json = JsonSerializer.Serialize(new { success = true, enabled });
                        await SendJsonResponse(response, json);
                    }
                    else
                    {
                        await SendError(response, HttpStatusCode.BadRequest, "Invalid enabled parameter");
                    }
                }

                // --- 3. WORKSPACE SNAPSHOTS API ENDPOINTS ---
                else if (urlPath == "/api/snapshots" && request.HttpMethod == "GET")
                {
                    var snapshots = _snapshotManager.GetSnapshots();
                    string json = JsonSerializer.Serialize(snapshots);
                    await SendJsonResponse(response, json);
                }
                else if (urlPath == "/api/snapshots/create" && request.HttpMethod == "POST")
                {
                    string? name = request.QueryString["name"];
                    // Decode name if it contains URL encoding (e.g. Hebrew characters)
                    if (!string.IsNullOrEmpty(name))
                    {
                        name = Uri.UnescapeDataString(name);
                    }
                    bool success = _snapshotManager.CreateSnapshot(name ?? "");
                    string json = JsonSerializer.Serialize(new { success });
                    await SendJsonResponse(response, json);
                }
                else if (urlPath == "/api/snapshots/restore" && request.HttpMethod == "POST")
                {
                    string? id = request.QueryString["id"];
                    if (string.IsNullOrEmpty(id))
                    {
                        await SendError(response, HttpStatusCode.BadRequest, "Missing id parameter");
                    }
                    else
                    {
                        bool success = _snapshotManager.RestoreSnapshot(id);
                        string json = JsonSerializer.Serialize(new { success });
                        await SendJsonResponse(response, json);
                    }
                }
                else if (urlPath == "/api/snapshots/delete" && request.HttpMethod == "DELETE")
                {
                    string? id = request.QueryString["id"];
                    if (string.IsNullOrEmpty(id))
                    {
                        await SendError(response, HttpStatusCode.BadRequest, "Missing id parameter");
                    }
                    else
                    {
                        bool success = _snapshotManager.DeleteSnapshot(id);
                        string json = JsonSerializer.Serialize(new { success });
                        await SendJsonResponse(response, json);
                    }
                }

                // --- 4. CLIPBOARD HISTORY API ENDPOINTS ---
                else if (urlPath == "/api/clipboard" && request.HttpMethod == "GET")
                {
                    var clipboardHistory = _clipboardMonitor.GetHistory();
                    string json = JsonSerializer.Serialize(clipboardHistory);
                    await SendJsonResponse(response, json);
                }
                else if (urlPath == "/api/clipboard/copy" && request.HttpMethod == "POST")
                {
                    string? id = request.QueryString["id"];
                    if (string.IsNullOrEmpty(id))
                    {
                        await SendError(response, HttpStatusCode.BadRequest, "Missing id parameter");
                    }
                    else
                    {
                        bool success = _clipboardMonitor.CopyToClipboard(id);
                        string json = JsonSerializer.Serialize(new { success });
                        await SendJsonResponse(response, json);
                    }
                }
                else if (urlPath == "/api/clipboard" && request.HttpMethod == "DELETE")
                {
                    _clipboardMonitor.ClearHistory();
                    string json = JsonSerializer.Serialize(new { success = true });
                    await SendJsonResponse(response, json);
                }
                else if (urlPath == "/api/clipboard/delete" && request.HttpMethod == "DELETE")
                {
                    string? id = request.QueryString["id"];
                    if (string.IsNullOrEmpty(id))
                    {
                        await SendError(response, HttpStatusCode.BadRequest, "Missing id parameter");
                    }
                    else
                    {
                        bool success = _clipboardMonitor.DeleteItem(id);
                        string json = JsonSerializer.Serialize(new { success });
                        await SendJsonResponse(response, json);
                    }
                }
                else
                {
                    await SendError(response, HttpStatusCode.NotFound, "Not Found");
                }
            }
            catch (Exception ex)
            {
                await SendError(response, HttpStatusCode.InternalServerError, ex.Message);
            }
        }

        private async Task ServeEmbeddedResource(HttpListenerResponse response, string fileName, string contentType)
        {
            var assembly = typeof(Program).Assembly;
            string resourceName = $"BackTrack.web.{fileName}";
            using var stream = assembly.GetManifestResourceStream(resourceName);
            if (stream == null)
            {
                await SendError(response, HttpStatusCode.NotFound, $"Resource {fileName} not found");
                return;
            }

            response.ContentType = contentType;
            response.StatusCode = (int)HttpStatusCode.OK;
            response.ContentLength64 = stream.Length;
            await stream.CopyToAsync(response.OutputStream);
            response.OutputStream.Close();
        }

        private async Task SendJsonResponse(HttpListenerResponse response, string json)
        {
            byte[] buffer = Encoding.UTF8.GetBytes(json);
            response.ContentType = "application/json; charset=utf-8";
            response.StatusCode = (int)HttpStatusCode.OK;
            response.ContentLength64 = buffer.Length;
            await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
            response.OutputStream.Close();
        }

        private async Task SendError(HttpListenerResponse response, HttpStatusCode statusCode, string message)
        {
            var errorObj = new { error = message };
            string json = JsonSerializer.Serialize(errorObj);
            byte[] buffer = Encoding.UTF8.GetBytes(json);
            response.ContentType = "application/json; charset=utf-8";
            response.StatusCode = (int)statusCode;
            response.ContentLength64 = buffer.Length;
            await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
            response.OutputStream.Close();
        }
    }
}
