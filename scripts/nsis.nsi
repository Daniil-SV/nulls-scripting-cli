; Custom NSIS logic for the oclif-generated Windows installer.
;
; oclif injects the contents of this file into its generated .nsi template
; (right before the installer sections) when `oclif pack win` runs — see
; `oclif.nsisCustomization` in package.json:
; https://oclif.io/docs/pack#oclif-pack-win
;
; Approach based on the Salesforce CLI customization:
; https://github.com/salesforcecli/cli/blob/main/scripts/nsis.nsi

; ---------------------------------------------------------------------------
; StrContains - taken from https://nsis.sourceforge.io/StrContains
; This function does a case sensitive search for an occurrence of a substring
; in a string. It returns the substring if it is found.
; Otherwise it returns null("").
; Written by kenglish_hi
; Adapted from StrReplace written by dandaman32
; ---------------------------------------------------------------------------

Var STR_HAYSTACK
Var STR_NEEDLE
Var STR_CONTAINS_VAR_1
Var STR_CONTAINS_VAR_2
Var STR_CONTAINS_VAR_3
Var STR_CONTAINS_VAR_4
Var STR_RETURN_VAR

Function StrContains
  Exch $STR_NEEDLE
  Exch 1
  Exch $STR_HAYSTACK
  ; Uncomment to debug
  ;MessageBox MB_OK 'STR_NEEDLE = $STR_NEEDLE STR_HAYSTACK = $STR_HAYSTACK '
    StrCpy $STR_RETURN_VAR ""
    StrCpy $STR_CONTAINS_VAR_1 -1
    StrLen $STR_CONTAINS_VAR_2 $STR_NEEDLE
    StrLen $STR_CONTAINS_VAR_4 $STR_HAYSTACK
    loop:
      IntOp $STR_CONTAINS_VAR_1 $STR_CONTAINS_VAR_1 + 1
      StrCpy $STR_CONTAINS_VAR_3 $STR_HAYSTACK $STR_CONTAINS_VAR_2 $STR_CONTAINS_VAR_1
      StrCmp $STR_CONTAINS_VAR_3 $STR_NEEDLE found
      StrCmp $STR_CONTAINS_VAR_1 $STR_CONTAINS_VAR_4 done
      Goto loop
    found:
      StrCpy $STR_RETURN_VAR $STR_NEEDLE
      Goto done
    done:
   Pop $STR_NEEDLE ;Prevent "invalid opcode" errors and keep the
   Exch $STR_RETURN_VAR
FunctionEnd

!macro _StrContainsConstructor OUT NEEDLE HAYSTACK
  Push `${HAYSTACK}`
  Push `${NEEDLE}`
  Call StrContains
  Pop `${OUT}`
!macroend

!define StrContains '!insertmacro "_StrContainsConstructor"'

; ---------------------------------------------------------------------------
; .onInit — runs before any installer page is shown.
; ---------------------------------------------------------------------------

Function .onInit

  ; Use explicit System32/Sysnative path to cmd.exe for security
  ; $R9 becomes the path to the global cmd.exe
  StrCpy $R9 "$WINDIR\System32\cmd.exe"  ; Try System32 first
  IfFileExists "$R9" path_is_safe
    StrCpy $R9 "$WINDIR\Sysnative\cmd.exe"  ; Try Sysnative for WOW64
    IfFileExists "$R9" path_is_safe
      MessageBox MB_OK|MB_ICONSTOP "Error: Could not find system cmd.exe. Installation cannot continue."
      Abort

  path_is_safe:

  ; Refuse to install over an npm-managed `nbs`. Both this installer and
  ; `npm install -g nulls-scripting-cli` put an `nbs` shim on PATH; keeping
  ; both makes `nbs` resolve unpredictably and breaks updates from either
  ; side. Look for nbs shims inside the usual npm global locations.
  nsExec::ExecToStack /TIMEOUT=5000 '"$R9" /c "where nbs"'
  ; exit code is stored on $0 first, then stdout
  Pop $0
  Pop $0
  ; $0 now contains stdout

  ; $1 is the result of the comparison
  ${StrContains} $1 "\npm\" $0
  StrCmp $1 "" check_nodejs_dir
    MessageBox MB_OK|MB_ICONSTOP "An npm-managed nbs is already installed (found an npm shim on PATH).$\n$\nUninstall it first:$\n$\n    npm uninstall -g nulls-scripting-cli$\n$\nThen run this installer again."
    Quit

  check_nodejs_dir:
  ; `npm config set prefix` pointing at the Node.js install dir (nvm-windows default)
  ${StrContains} $1 "\nodejs\" $0
  StrCmp $1 "" check_volta_dir
    MessageBox MB_OK|MB_ICONSTOP "An npm-managed nbs is already installed (found a shim next to Node.js on PATH).$\n$\nUninstall it first:$\n$\n    npm uninstall -g nulls-scripting-cli$\n$\nThen run this installer again."
    Quit

  check_volta_dir:
  ${StrContains} $1 "\volta\" $0
  StrCmp $1 "" npm_not_found
    MessageBox MB_OK|MB_ICONSTOP "An npm-managed nbs is already installed (found a Volta shim on PATH).$\n$\nUninstall it first:$\n$\n    npm uninstall -g nulls-scripting-cli$\n$\nThen run this installer again."
    Quit

  npm_not_found:

FunctionEnd
