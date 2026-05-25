Claude Chats and Cowork tell you nothing about how much token capacity you have left. Not how full the current session's context has grown, not whether you're spending the weekly limit faster than the week is passing. You tend to find out when a session slows to a crawl or the limit stops you mid-thought, which is the worst possible moment to find out.

This is a small window that sits in the corner of your screen and answers that quietly, while you work. It watches Cowork sessions and ordinary Claude web chats alike.

<img width="668" height="375" alt="image" src="https://github.com/user-attachments/assets/c0846b78-86d1-4769-a6b3-35cbd3b47b7f" />
<img width="670" height="337" alt="image" src="https://github.com/user-attachments/assets/a0e0e7ff-31f1-4e0f-8a48-a4ebdb3dd6cd" />


Counter Sits in the corner of a screen and warns when the current chat context grows, so you can choose to continue and burn more tokens per chat or break-off into a new chat to conserve tokens

<img width="922" height="749" alt="image" src="https://github.com/user-attachments/assets/6a752b83-653d-4939-a645-9594d3b9bcec" />
Lets you see all your chats and thier context burn.

## What it shows

Three readouts, each refreshed on its own.

Weekly usage comes with a pacing read. The weekly limit resets every seven days, so an even spend works out a little over 14% a day. A marker on the bar shows where an even spend would put you at this exact point in the week. Ahead of the marker the bar turns red and tells you by how much; behind it, green. Some days you will be over and some under. The point is that you can see it and pace yourself rather than guess. When you are running ahead, it also reckons the recovery — how many hours of spending nothing it would take for the marker to draw level again.

Session usage is the shorter five-hour window, with a countdown to its reset. Nothing clever here. It is simply useful to have in view.

Context size is the part that earns the tool its name. It is the token count of the session you are tracking, with a bar against that session's context window. The line underneath always names the session, so when a warning fires you know exactly which chat it means. As a session grows large enough to cost you speed the figure turns amber; near the ceiling it turns red and says, plainly, to start a new one. It cannot open the new chat for you. It can only make sure you notice in time.

## Tracking a session, or a chat

The counter follows your most recently used Cowork session by default. The dial button on the window opens the full list: every Cowork session and every recent Claude web chat, each shown with its size and colour-coded so the bloated ones stand out. Pick one to pin it, or leave it on automatic.

Cowork sessions and web chats are measured differently, because they are different. A Cowork session's size is read straight from its transcript, which records the exact count. A web chat keeps no such record, so its size is estimated from the conversation text — close enough to know when a chat is getting heavy, not down to the token. Cowork sessions also run a far larger context window than web chats, and the bar is scaled to whichever applies.

## What it costs you

Nothing. A meter that consumed what it measured would be a poor meter. It never sends a message and never calls the model. It reads Cowork transcripts from your own disk, and it makes read-only requests to claude.ai for your usage figures and your chat list — the same requests your browser already makes to show you those pages. Counting is arithmetic. Your token allowance is left exactly where it was.

## Installing it

You will need [Node.js](https://nodejs.org), installed once. The installer is the ordinary next-next-finish kind.

1. Download this project and put the folder on your Desktop. This matters more than it sounds. Windows will not launch a program buried in a long folder path, and the Desktop keeps the path short.
2. Open the folder and double-click `Start Claude Counter`. The first run installs the runtime it needs — about 150 MB, a few minutes. Leave the window open while it works. It picks the right runtime for your processor on its own, Intel or ARM.
3. A claude.ai window opens once. Sign in. That step is only for the usage bars; the Cowork context counter works without it.

The small window then appears in the top-right corner. Closing it closes the app. If it ever refuses to start, the folder has most likely been moved somewhere with a long path — move it back to the Desktop.

## Putting it on your taskbar

Once it runs, double-click `Create shortcut` in the same folder. That places a "Claude Counter" shortcut on your Desktop. Right-click the shortcut and choose Pin to taskbar, and from then on it launches from there — straight to the window, no console. The same step also sets it to start when you sign in to Windows.

## A note on the limits

It reads; it does not act. It will not start a chat, change a setting, or touch your account. The weekly and session percentages come from Claude's own usage page and are rounded the way that page rounds them. Cowork context counts are exact. Web chat context counts are estimates - treat them as a guide, not a gauge.

