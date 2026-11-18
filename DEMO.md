# Demo script: Corporate AI (team SAL)

About 4 minutes. Rehearsed on 18 Nov 2026 at 5:36 PM; times below are from that run.

## Before you go on stage
- Use **Chrome** on a laptop that's plugged in. Close other heavy apps (the 3D view drops frames when the machine is busy).
- Open the page once on the venue Wi-Fi beforehand: the 3D library, fonts and the robot model load from the internet, and the browser keeps them cached.
- Start the server from a clean company:
  ```bash
  cd app
  rm -f /tmp/corp-ai-demo/company.json
  CORP_BRAIN=scripted CORP_DATA=/tmp/corp-ai-demo/company.json node src/server.js
  ```
  `CORP_BRAIN=scripted` is the offline demo brain: same result every time, no Claude calls, a short pause per step so you can see the floors work. Drop it to run real Claude staff (steps then take a minute or more each).
- Have a second tab ready on `http://127.0.0.1:4700/landing/`.
- **Live mode (Gemini):** with `GEMINI_API_KEY` in `app/.env`, start a second server on another port with real agents:
  ```bash
  cd app && PORT=4701 CORP_DATA=/tmp/corp-ai-live/company.json node src/server.js
  ```
  On the Terrace, *Talk to your CEO*: "Start a monthly Assam tea box for office teams in Gurugram and tell me the plan in 3 lines." It answers in about 30 s using `gemini-3.5-flash-lite` (the free tier's fastest model; it falls back to others if Google is busy). The free key has no Google Search, so staff answer without browsing, and any contact they suggest still has to pass the page check.

## The run (who says what)

| Time | On screen | Say |
|---|---|---|
| 0:00 | **Landing page** | *(Swayam)* "We ran 25 AI agents as a company. They made up contacts we couldn't check, duplicated each other's work, and could promise money. A prompt can't stop that. So we put the rules in code." |
| 0:30 | **Open the building**: the camera flies in over the city | "This is Corporate AI. Every floor is a department of AI staff. Your CEO, an AI agent, works on the roof: you chat with it and it runs the company." |
| 0:45 | Scroll the wheel up and down: floors highlight one by one | "Finance, operations, marketing, sales, tech, support, HR, legal, and the chief of staff on 9." |
| 1:00 | **Lobby** (click G). The form is at the top. Type the idea and the problem, press **Start and plan it** | "We give it a business idea. The chief of staff turns it into a task graph." *(about 2.5 s; "Planned 5 tasks across the floors")* |
| 1:20 | Tick **Autopilot**, press **Esc** to go back out | *(Aryan)* "Now the staff work. Watch the floors light up." |
| 1:30 | Click **Operations** (floor 2) while it's working: robots at desks, "Working on T1" | "Each robot is a Claude agent with web search. They hand work to each other through the task graph." |
| 1:50 | All 7 tasks finish in about 20 s. Back to the **Lobby**, scroll to **Rails** | *(Laksh)* "Here's what the code blocked: a duplicate task, an email address that wasn't on the supplier's page, a message that promised an advance payment, and a supplier page with hidden 'ignore your instructions' text." |
| 2:20 | **Needs your decision**: press **Approve** on the ₹1,450 sample | "The company never pays. The CEO has no tool to approve money. Only the owner can." |
| 2:35 | **Outreach drafts**: point at "Found on … hillside-tea.example/contact: …" | "Every contact carries proof: the exact text from the page it came from. If a page can't be read, nothing goes out." |
| 2:45 | **Terrace** (click R): in **Talk to your CEO**, press *What needs my decision?* | "And you run all this by talking to your CEO. It uses the company's tools, but it has no tool to approve money." |
| 2:50 | **Board meeting now** (amber button) | "Every night the CEO gives the owner this board report: done, decisions, outreach, rails." |
| 3:05 | *(optional, needs internet + Claude login)* terminal: `node demo/before-after.js` | "On the real web: a Claude agent found 5 supplier contacts; our verifier confirmed 4 on their own pages and blocked one it couldn't read." |
| 3:30 | *(optional)* Claude Code in this repo: "You're the CEO of Corporate AI. Start a venture… give me the board report." | "And the same CEO can be run from Claude Code, driving the company through our MCP tools." |
| 3:50 | Close on the **Terrace** (click R): the the CEO hologram | "Agents can do real business work, as long as the rules are code. Thank you." |

## If something goes wrong
- **3D view is blank** (no internet for the 3D library): the panels still work. Use the lobby and floor panels, or `node demo/run.js` in a terminal, which prints the whole run and the board report.
- **Autopilot seems stuck**: press **Run one step** on the Terrace panel, or untick and tick Autopilot again.
- **Need a fresh start**: stop the server, `rm -f /tmp/corp-ai-demo/company.json`, start it again.

## Questions judges may ask
- *Where's the hard part?* `app/src/rails.js`: contact verification against the cited page (browser-like fetch, malformed tags, Cloudflare-hidden emails, hidden text ignored, unreadable pages fail closed), the money gate, AI disclosure, injection checks and task-graph limits. Tests: `app/test/rails.test.js`.
- *How does the CEO connect?* `app/src/mcp.js`, a stdio MCP server registered in `.mcp.json`. It has no tool to approve spending.
- *What's real and what's scripted?* The offline brain replays fixed answers for the stage. Live mode (`node demo/run.js --live`, or the server without `CORP_BRAIN`) uses real Claude with web search; we ran it today and it drafted three supplier emails, each verified on the supplier's own page.
- *Is the robot model yours?* It's "RobotExpressive" by Quaternius, CC0 (public domain). Everything else is built in code.
