# Installing Clippah

Clippah 0.1.0 is currently installed as an **unpacked Chromium extension**.

Supported target for the MVP:

- Google Chrome 116+
- Microsoft Edge 116+
- Brave based on Chromium 116+

## Option A — clone with Git

### Windows

Open PowerShell:

```powershell
cd $HOME\Downloads
git clone https://github.com/SirPaul-code/Clippah.git
cd Clippah
```

### macOS / Linux

```bash
cd ~/Downloads
git clone https://github.com/SirPaul-code/Clippah.git
cd Clippah
```

Then load the folder as an unpacked extension.

## Option B — Download ZIP from GitHub

1. Open the repository.
2. Click **Code**.
3. Click **Download ZIP**.
4. Extract it.
5. Use the extracted folder that directly contains `manifest.json`.

Do **not** point Chrome at the ZIP itself.

## Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** in the top-right.
3. Click **Load unpacked**.
4. Select the Clippah folder containing `manifest.json`.
5. Open the Extensions menu.
6. Pin **Clippah**.

## Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the Clippah folder.
5. Pin Clippah.

## Brave

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the Clippah folder.
5. Pin Clippah.

## First-use test

After loading the extension:

1. Open a normal YouTube video.
2. If the tab was already open before installation, refresh it once.
3. Wait until the video player is visible.
4. The Clippah control bar should appear over the player.
5. Click the Clippah toolbar icon once.
6. The overlay status should change from **MARK ONLY** to **ARMED**.
7. Start playback.
8. Click **[ IN**.
9. Let several seconds play.
10. Click **OUT ]**.
11. Click **STUDIO**.
12. The captured clip should be listed on the left.

## Keyboard controls

- `[` — IN
- `]` — OUT
- `Ctrl+Shift+K` — invoke the Clippah browser action
- `Cmd+Shift+K` on macOS

The browser may reassign shortcuts. You can inspect/change extension shortcuts at:

- Chrome: `chrome://extensions/shortcuts`
- Edge: `edge://extensions/shortcuts`

## Updating after a git pull

Run:

```bash
git pull
```

Then:

1. Open the browser extensions page.
2. Find Clippah.
3. Click **Reload**.
4. Refresh any already-open video tabs.

## Updating after downloading a new ZIP

1. Replace the old extracted files with the new version, or extract to a new folder.
2. If the folder path changed, remove the old unpacked extension and load the new folder.
3. If the path stayed the same, click **Reload** on the extensions page.
4. Refresh open video tabs.

## Packaging your own ZIP

### Windows

From the repository root:

```powershell
./scripts/package.ps1
```

### macOS / Linux

```bash
chmod +x ./scripts/package.sh
./scripts/package.sh
```

Output:

```text
dist/Clippah-v0.1.0.zip
```

The package contains only runtime extension files.

## GitHub Actions package

Every push runs the **Validate and package extension** workflow.

It:

1. Parses `manifest.json`.
2. Runs `node --check` on all runtime JavaScript.
3. Packages the runtime files.
4. Uploads the ZIP as a workflow artifact.

This is useful before creating a Chrome Web Store release.
