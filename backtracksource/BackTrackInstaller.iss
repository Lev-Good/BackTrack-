; Inno Setup Installer Script for BackTrack
; See https://www.jrsoftware.org/isinfo.php for documentation on Inno Setup

[Setup]
AppName=BackTrack
AppVersion=1.0
AppPublisher=BackTrack Desktop
DefaultDirName={userappdata}\BackTrack
DefaultGroupName=BackTrack
UninstallDisplayIcon={app}\backtrack_icon.ico
Compression=lzma2
SolidCompression=yes
OutputDir=.
OutputBaseFilename=BackTrackSetup
PrivilegesRequired=lowest
SetupIconFile=backtrack_icon.ico

[Files]
; Copy the compiled Release executable, DLL, icon, and configuration files
Source: "bin\Release\net10.0-windows\החזר פעולה במחשב.exe"; DestDir: "{app}"; DestName: "BackTrack.exe"; Flags: ignoreversion
Source: "bin\Release\net10.0-windows\החזר פעולה במחשב.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "bin\Release\net10.0-windows\החזר פעולה במחשב.deps.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "bin\Release\net10.0-windows\החזר פעולה במחשב.runtimeconfig.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "backtrack_icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\BackTrack"; Filename: "{app}\BackTrack.exe"
Name: "{userdesktop}\BackTrack"; Filename: "{app}\BackTrack.exe"; IconFilename: "{app}\backtrack_icon.ico"

[Run]
; Launch the application silently after installation is complete
Description: "הפעל את BackTrack כעת"; Filename: "{app}\BackTrack.exe"; Flags: nowait postinstall skipifsilent

[Registry]
; Register the app to start automatically when Windows boots (user-level startup registry key)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "BackTrack"; ValueData: """{app}\BackTrack.exe"""; Flags: uninsdeletevalue
