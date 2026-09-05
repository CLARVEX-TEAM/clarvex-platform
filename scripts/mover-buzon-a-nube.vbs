Option Explicit

Dim shell, files, scriptPath, powershellPath, command, argument
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
scriptPath = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), "mover-buzon-a-nube.ps1")
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")

If Not files.FileExists(scriptPath) Then WScript.Quit 2

command = QuoteArgument(powershellPath) & " -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & QuoteArgument(scriptPath)
For Each argument In WScript.Arguments
    command = command & " " & QuoteArgument(argument)
Next

' Start hidden from the GUI host; wait so Task Scheduler receives the real exit code.
WScript.Quit shell.Run(command, 0, True)

' Windows command-line quoting also escapes trailing backslashes before the closing quote.
Function QuoteArgument(value)
    Dim result, slashes, i, character
    result = Chr(34)
    slashes = 0
    For i = 1 To Len(value)
        character = Mid(value, i, 1)
        If character = "\" Then
            slashes = slashes + 1
        Else
            If character = Chr(34) Then
                result = result & String(2 * slashes + 1, "\") & character
            Else
                result = result & String(slashes, "\") & character
            End If
            slashes = 0
        End If
    Next
    QuoteArgument = result & String(2 * slashes, "\") & Chr(34)
End Function
