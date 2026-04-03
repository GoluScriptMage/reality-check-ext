# Reality Check made by golu.v2

Reality Check is a Chrome extension that helps you use YouTube more intentionally. It asks why you opened YouTube, sets a reminder interval, and then checks back in so you can stay aligned with your goal.

## What it does

- Shows a popup for starting and stopping reminder sessions.
- Opens a setup flow on YouTube that asks for your reason and reminder interval.
- Stores the current session in Chrome storage so the state persists while you browse.
- Shows reminder check-ins directly on YouTube.

## Main files

- [manifest.json](manifest.json) defines the extension, popup, permissions, and YouTube content script.
- [index.js](index.js) runs on YouTube pages and manages the reminder flow, overlays, and session timing.
- [popup.html](popup.html), [popup.css](popup.css), and [popup.js](popup.js) power the extension popup UI.
- [landing.html](landing.html), [landing.css](landing.css), and [landing.js](landing.js) provide the showcase page.
- [assets/icons](assets/icons) contains the extension icons.

## How it works

1. Open YouTube in Chrome.
2. Click the Reality Check extension icon.
3. Start the setup from the popup.
4. Enter your reason and choose a reminder interval.
5. The extension saves the session and shows reminder check-ins while you watch.

## Example flow

### 1) Start a session

Open the popup and click **Start reminder setup**.

### 2) Set your reason

Enter something specific, for example:

- “Watch one React hooks tutorial”
- “Find the answer to this coding issue”
- “Watch a single product demo”

### 3) Choose the interval

Pick how often you want the extension to remind you. A short interval like 10 minutes works well for focused browsing.

### 4) Respond to reminders

When the check-in appears, either keep going intentionally or stop the reminders from the popup.

## Screens and showcase media

If you want to add a video to this README, the simplest options are an animated GIF or a hosted MP4.

### Option 1: Embed a GIF

Place the file in the repo, then use:

```md
![Reality Check demo](assets/showcase/demo.gif)
```

### Option 2: Link to an MP4

If the video is too large for Git, host it somewhere and link it like this:

```md
[Watch the demo video](https://example.com/reality-check-demo.mp4)
```

### Option 3: Use HTML video

For a local MP4 in the repository, you can also use HTML in Markdown:

```html
<video controls src="assets/showcase/demo.mp4" width="100%"></video>
```

## Suggested showcase assets

The landing page expects these screenshots in [assets/showcase](assets/showcase):

- `goal-prompt.png`
- `interval-setup.png`
- `popup-status.png`
- `reminder-modal.png`

## Installation

1. Open Chrome and go to `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select this project folder.

## Notes

- The extension currently targets YouTube pages only.
- Reminder state is stored locally with Chrome storage.
- The landing page is separate from the extension popup and is meant for presentation.

## License

No license has been specified yet.
