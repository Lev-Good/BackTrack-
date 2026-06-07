using System;
using System.Drawing;
using System.Windows.Forms;
using System.Threading;
using System.Diagnostics;

namespace BackTrack
{
    static class Program
    {
        private static NotifyIcon? _trayIcon;
        private static Tracker? _tracker;
        private static RecentFilesWatcher? _recentWatcher;
        private static ClipboardMonitor? _clipboardMonitor;
        private static SnapshotManager? _snapshotManager;
        private static WebServer? _webServer;
        private static System.Threading.Timer? _pollTimer;
        private static Mutex? _appMutex;
        private const string MutexName = "BackTrackSingleInstanceMutex";
        private const int WebPort = 8420;
        private const int HotkeyId = 1;

        [STAThread]
        static void Main()
        {
            // 1. Single Instance Check
            _appMutex = new Mutex(true, MutexName, out bool isNewInstance);
            if (!isNewInstance)
            {
                MessageBox.Show("אפליקציית BackTrack כבר רצה ברקע במחשב זה.", "BackTrack", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                // Set to start with Windows startup
                SetStartup(true);

                // 2. Initialize Core Logic
                _tracker = new Tracker();
                _clipboardMonitor = new ClipboardMonitor();
                _snapshotManager = new SnapshotManager();

                // 3. Start Polling Loop for folders and apps (Every 1 second)
                _pollTimer = new System.Threading.Timer((state) =>
                {
                    _tracker?.Poll();
                }, null, 1000, 1000);

                // 4. Start Recent Files Watcher
                _recentWatcher = new RecentFilesWatcher((filePath, fileName) =>
                {
                    _tracker?.AddFileToHistory(filePath, fileName);
                });
                _recentWatcher.Start();

                // 5. Start Local Web Server
                _webServer = new WebServer(_tracker, _clipboardMonitor, _snapshotManager, WebPort);
                _webServer.Start();

                // 6. Register Global Hotkey (Ctrl + Alt + Z)
                bool hotkeyRegistered = Win32.RegisterHotKey(IntPtr.Zero, HotkeyId, Win32.MOD_CONTROL | Win32.MOD_ALT, 0x5A);

                // 7. Setup Hotkey Event Message Filter
                Application.AddMessageFilter(new HotkeyMessageFilter(OnHotkeyTriggered));

                // 8. Setup System Tray Icon
                SetupTrayIcon(hotkeyRegistered);

                // 9. Run message loop
                Application.Run();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"שגיאה במהלך הפעלת האפליקציה: {ex.Message}", "שגיאת מערכת BackTrack", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                Cleanup();
            }
        }

        private static void SetupTrayIcon(bool hotkeyRegistered)
        {
            Icon icon;
            try
            {
                var assembly = typeof(Program).Assembly;
                using var stream = assembly.GetManifestResourceStream("BackTrack.backtrack_icon.ico");
                icon = stream != null ? new Icon(stream) : SystemIcons.Application;
            }
            catch
            {
                icon = SystemIcons.Application;
            }

            _trayIcon = new NotifyIcon
            {
                Icon = icon,
                Text = "BackTrack - שחזור פעולות במחשב",
                Visible = true
            };

            var contextMenu = new ContextMenuStrip
            {
                RightToLeft = RightToLeft.Yes
            };

            var restoreItem = new ToolStripMenuItem("שחזר פעולה אחרונה (Ctrl + Alt + Z)", null, (s, e) => OnHotkeyTriggered());
            var historyItem = new ToolStripMenuItem("הצג היסטוריית פעילות", null, (s, e) => OpenHistory());
            
            // Private Mode Item with checkbox toggle
            var privateModeItem = new ToolStripMenuItem("מצב פרטי (אל תפריע)", null, (s, e) => TogglePrivateMode());
            privateModeItem.CheckOnClick = true;

            var exitItem = new ToolStripMenuItem("יציאה", null, (s, e) => Application.Exit());

            contextMenu.Items.Add(restoreItem);
            contextMenu.Items.Add(historyItem);
            contextMenu.Items.Add(privateModeItem);
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add(exitItem);

            _trayIcon.ContextMenuStrip = contextMenu;
            _trayIcon.DoubleClick += (s, e) => OpenHistory();

            // Synchronize the menu state with the API when opening the context menu
            contextMenu.Opening += (s, e) =>
            {
                privateModeItem.Checked = _tracker?.IsPrivateMode ?? false;
            };

            string hotkeyStatus = hotkeyRegistered ? "קיצור המקשים Ctrl+Alt+Z פעיל." : "שגיאה ברישום קיצור המקשים.";
            _trayIcon.ShowBalloonTip(3000, "BackTrack פעיל", $"המערכת מנטרת תיקיות, קבצים ואפליקציות שנסגרים. {hotkeyStatus}", ToolTipIcon.Info);
        }

        private static void TogglePrivateMode()
        {
            if (_tracker == null || _clipboardMonitor == null || _trayIcon?.ContextMenuStrip == null) return;

            foreach (ToolStripItem item in _trayIcon.ContextMenuStrip.Items)
            {
                if (item is ToolStripMenuItem menuItem && menuItem.Text != null && menuItem.Text.StartsWith("מצב פרטי"))
                {
                    bool enabled = menuItem.Checked;
                    _tracker.IsPrivateMode = enabled;
                    _clipboardMonitor.IsPrivateMode = enabled;

                    string statusText = enabled ? "מצב פרטי פעיל. הניטור מושהה זמנית." : "מצב פרטי כבוי. הניטור פעיל.";
                    _trayIcon.ShowBalloonTip(1500, "BackTrack", statusText, ToolTipIcon.Info);
                    break;
                }
            }
        }

        private static void OnHotkeyTriggered()
        {
            if (_tracker == null) return;

            // 1. Check if the active window is a web browser
            if (IsActiveWindowBrowser())
            {
                Win32.SimulateCtrlShiftT();
                return;
            }

            // 2. Otherwise, restore the last tracked closed item
            bool success = _tracker.RestoreLast();
            if (!success)
            {
                _trayIcon?.ShowBalloonTip(1500, "BackTrack", "אין פעילויות שנסגרו בזיכרון לשחזור.", ToolTipIcon.Warning);
            }
        }

        private static bool IsActiveWindowBrowser()
        {
            try
            {
                IntPtr hWnd = Win32.GetForegroundWindow();
                if (hWnd == IntPtr.Zero) return false;

                Win32.GetWindowThreadProcessId(hWnd, out uint pid);
                if (pid == 0) return false;

                using var proc = Process.GetProcessById((int)pid);
                string procName = proc.ProcessName.ToLowerInvariant();

                return procName == "chrome" || 
                       procName == "msedge" || 
                       procName == "firefox" || 
                       procName == "opera" || 
                       procName == "brave";
            }
            catch
            {
                return false;
            }
        }

        private static void OpenHistory()
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = $"http://localhost:{WebPort}/",
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"לא ניתן לפתוח את ממשק הדפדפן: {ex.Message}", "שגיאה ב-BackTrack", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void Cleanup()
        {
            // Unregister hotkey
            Win32.UnregisterHotKey(IntPtr.Zero, HotkeyId);

            // Stop watchers & timer
            _recentWatcher?.Stop();
            _pollTimer?.Dispose();

            // Stop clipboard listener
            _clipboardMonitor?.Dispose();

            // Stop server
            _webServer?.Stop();

            // Remove tray icon
            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
            }

            // Release mutex
            if (_appMutex != null)
            {
                _appMutex.ReleaseMutex();
                _appMutex.Close();
            }
        }

        private static void SetStartup(bool startWithWindows)
        {
            try
            {
                using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);
                if (key != null)
                {
                    string appPath = Process.GetCurrentProcess().MainModule?.FileName ?? "";
                    if (!string.IsNullOrEmpty(appPath))
                    {
                        if (startWithWindows)
                        {
                            key.SetValue("BackTrack", $"\"{appPath}\"");
                        }
                        else
                        {
                            key.DeleteValue("BackTrack", false);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to set startup registry key: {ex.Message}");
            }
        }
    }

    public class HotkeyMessageFilter : IMessageFilter
    {
        private readonly Action _onHotkeyTriggered;

        public HotkeyMessageFilter(Action onHotkeyTriggered)
        {
            _onHotkeyTriggered = onHotkeyTriggered;
        }

        public bool PreFilterMessage(ref Message m)
        {
            if (m.Msg == Win32.WM_HOTKEY)
            {
                _onHotkeyTriggered();
                return true; 
            }
            return false;
        }
    }
}
