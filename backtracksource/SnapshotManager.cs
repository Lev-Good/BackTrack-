using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Diagnostics;

namespace BackTrack
{
    public class WorkspaceSnapshot
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = "";
        public List<string> Paths { get; set; } = new List<string>();
        public DateTime Timestamp { get; set; } = DateTime.Now;
    }

    public class SnapshotManager
    {
        private readonly string _filePath;
        private readonly string _dirPath;
        private List<WorkspaceSnapshot> _snapshots = new List<WorkspaceSnapshot>();
        private readonly object _lock = new object();

        public SnapshotManager()
        {
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            _dirPath = Path.Combine(userProfile, ".backtrack");
            _filePath = Path.Combine(_dirPath, "snapshots.json");
            LoadSnapshots();
        }

        public List<WorkspaceSnapshot> GetSnapshots()
        {
            lock (_lock)
            {
                return _snapshots.ToList();
            }
        }

        public bool CreateSnapshot(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                name = $"קבוצה מ-{DateTime.Now:dd/MM/yyyy HH:mm}";
            }

            var paths = GetOpenExplorerPaths();
            if (paths.Count == 0) return false;

            lock (_lock)
            {
                var snapshot = new WorkspaceSnapshot
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = name,
                    Paths = paths,
                    Timestamp = DateTime.Now
                };
                _snapshots.Insert(0, snapshot);
                SaveSnapshotsLocked();
            }
            return true;
        }

        public bool RestoreSnapshot(string id)
        {
            WorkspaceSnapshot? snapshot = null;
            lock (_lock)
            {
                snapshot = _snapshots.FirstOrDefault(x => x.Id == id);
            }

            if (snapshot == null) return false;

            bool success = false;
            foreach (var path in snapshot.Paths)
            {
                try
                {
                    // Open folder in Explorer
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = path,
                        UseShellExecute = true
                    });
                    success = true;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"Failed to open snapshot path {path}: {ex.Message}");
                }
            }
            return success;
        }

        public bool DeleteSnapshot(string id)
        {
            lock (_lock)
            {
                var snapshot = _snapshots.FirstOrDefault(x => x.Id == id);
                if (snapshot != null)
                {
                    _snapshots.Remove(snapshot);
                    SaveSnapshotsLocked();
                    return true;
                }
            }
            return false;
        }

        private List<string> GetOpenExplorerPaths()
        {
            var paths = new List<string>();
            try
            {
                Type? shellType = Type.GetTypeFromProgID("Shell.Application");
                if (shellType != null)
                {
                    dynamic? shell = Activator.CreateInstance(shellType);
                    if (shell != null)
                    {
                        dynamic windows = shell.Windows();
                        int count = windows.Count;
                        for (int i = 0; i < count; i++)
                        {
                            try
                            {
                                dynamic window = windows.Item(i);
                                if (window == null) continue;

                                string fullName = window.FullName;
                                if (fullName.EndsWith("explorer.exe", StringComparison.OrdinalIgnoreCase))
                                {
                                    string path = window.Document.Folder.Self.Path;
                                    if (!string.IsNullOrEmpty(path))
                                    {
                                        paths.Add(path);
                                    }
                                }
                            }
                            catch { }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to get open Explorer paths for snapshot: {ex.Message}");
            }
            return paths.Distinct().ToList();
        }

        private void LoadSnapshots()
        {
            lock (_lock)
            {
                try
                {
                    if (File.Exists(_filePath))
                    {
                        string json = File.ReadAllText(_filePath);
                        _snapshots = JsonSerializer.Deserialize<List<WorkspaceSnapshot>>(json) ?? new List<WorkspaceSnapshot>();
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"Failed to load snapshots: {ex.Message}");
                    _snapshots = new List<WorkspaceSnapshot>();
                }
            }
        }

        private void SaveSnapshotsLocked()
        {
            try
            {
                if (!Directory.Exists(_dirPath))
                {
                    Directory.CreateDirectory(_dirPath);
                }

                string json = JsonSerializer.Serialize(_snapshots, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_filePath, json);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to save snapshots: {ex.Message}");
            }
        }
    }
}
