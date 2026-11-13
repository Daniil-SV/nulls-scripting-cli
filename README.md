# nulls-scripting-cli

CLI for Null's Brawl scripting.

## Requirements

Node.js 22.22.2 or newer.

Device features are optional and need `adb`, see [Device setup](#device-setup).

## Install

```sh
npm install -g nulls-scripting-cli
nbs --help
```

## Quick start

```sh
# Create a script, nbsproject.toml, and optionally a device config
nbs init

# Upload the configured script and reload it on the device
nbs content set --watch --open
```

## Commands

```sh
nbs init                    # create the project config and optional device setup
nbs list                    # browse scripts
nbs whoami                  # show the current account
nbs content get --id "My Script"
nbs content set --id "My Script" --path ./script.luau
nbs content set --watch --open
nbs sync                    # apply name and description from the config
nbs parameters              # configure script parameters
nbs publish                 # publish the configured draft
nbs logout
```

Global flags:

- `-p, --project <path>` - load a specific config file.
- `--id <uuid|name>` - target script.
- `--path <file>` - target script file.

## Configuration

`nbsproject.toml` holds the project properties. `.nbsrc` holds local device
settings. Both are searched in the project root and `.config/`. TOML, JSON and
JavaScript are supported. Extensionless files such as `.nbsrc` are read as
TOML. `package.json` can also hold config in its `nbs` field.

Example `nbsproject.toml`:

```toml
name = "My Script"
id = "01a1cfd5-0965-7d0a-8103-530b00a684a4"
description = "A sample script that demonstrates the project config"

path = "./script.luau"

[[parameters]]
name = "enableChat"
value = true
```

- `id` - script UUID. A name passed with `--id` is resolved through the API.
- `path` - script file, relative to the config file.
- `parameters` - friendly battle parameter overrides.
- `process.adb` - device settings, see below.

See `examples/hello_wolrd` for a complete project.

## Device setup

Device features are optional. `nbs init` sets them up automatically: choose
`MuMuPlayer` or `Manual`. For MuMuPlayer, the CLI finds the installation, lists
instances, launches the selected one, reads its adb host and port, and writes
`.nbsrc`. To change device settings later, run `nbs init --device`.

`nbs` uses `adb` from `PATH`. If it is not found there, it looks in the same
folder as `process.adb.command`. If adb is missing, install
[Android Platform Tools](https://developer.android.com/tools/releases/platform-tools)
and add it to `PATH`.

<details>
<summary>Manual MuMuPlayer setup</summary>

The CLI was tested with MuMu Player 12 on Windows. `MuMuManager.exe` is in the
MuMu install directory, usually `nx_main\` or `shell\`. The main instance
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

Example `.nbsrc`:

```toml
[process.adb]
command = "D:/Program Files/Netease/MuMuPlayer/nx_main/MuMuManager.exe"
args = [ "control", "-v", "0", "launch" ]
deviceAddress = "127.0.0.1"
devicePort = 16384
defaultDevice = "127.0.0.1:16384"
waitForDevice = true
```

</details>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately as
described in [SECURITY.md](SECURITY.md).

## License

MIT
