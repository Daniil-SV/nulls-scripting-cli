# nulls-scripting-cli

CLI for Null's Brawl scripting.

## Requirements

Node.js 22.9 or newer.

Device features are optional and need `adb`, see the device setup below.

## Install

```sh
npm install -g nulls-scripting-cli
nbs --help
```

## Commands

```sh
# Log in and browse scripts
nbs list
nbs whoami

# Read script content
nbs content get --name "My Script"

# Update script content
nbs content set ./script.lua --name "My Script"
nbs content set ./script.lua --name "My Script" --watch --open

# Publish a script
nbs publish "My Script" ./script.lua --update

# Log out
nbs logout
```

Use `-p, --project <path>` on any command to load a different config.

## Configuration

Create `.nbsrc.json` in your project root:

```json
{
	"name": "My Script",
	"path": "./script.lua",
	"parameters": [{ "name": "enableChat", "value": true }]
}
```

- `name` — script name or UUID.
- `path` — script file. Falls back to `main` in `package.json` when omitted.
- `process.adb` — optional settings for opening scripts on a device. See the
  device setup below.
- `parameters` — friendly battle parameter overrides.

<details>
<summary>Optional device setup</summary>

Opening a script on a device needs `adb`. This works with a real device or any
emulator. `adb` is usually installed with the emulator. If it is missing,
install
[Android Platform Tools](https://developer.android.com/tools/releases/platform-tools)
and add it to `PATH`.

`nbs` uses `adb` from `PATH`. If it is not found there, it looks in the same
folder as `process.adb.command`.

<details>
<summary>MuMu Player 12 example</summary>

The CLI was tested with MuMu Player 12 on Windows. `MuMuManager.exe` is in the
MuMu install directory, usually `shell\` or `nx_main\`. The main instance
normally uses port `16384`; additional instances add `32` (`16416`, `16448`,
...).

Find the adb port:

```powershell
MuMuManager.exe info -v 0
```

Use the `adb_port` value from the output.

Connect adb:

```powershell
MuMuManager.exe adb -v 0 connect
```

Some MuMu versions use:

```powershell
MuMuManager.exe adb -v 0 -c connect
```

Example `.nbsrc.json` with MuMu paths:

```json
{
	"name": "Sample",
	"process": {
		"adb": {
			"command": "D:/Program Files/Netease/MuMuPlayer/nx_main/MuMuNxMain.exe",
			"args": ["-v", "0", "--engine_series=12.0"],
			"defaultDevice": "127.0.0.1:16384",
			"deviceAddress": "127.0.0.1",
			"devicePort": 16384,
			"waitForDevice": true
		}
	},
	"parameters": [{ "name": "enableChat", "value": true }]
}
```

</details>
</details>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately as
described in [SECURITY.md](SECURITY.md).

## License

MIT
