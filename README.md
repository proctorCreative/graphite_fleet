# Graphite Fleet

Graphite Fleet is an independent, noncommercial browser adaptation of a traditional pencil-and-paper space-combat game passed between classrooms and friends, professors and students. Thank you, Professor Armstrong.

## Play Online

https://proctorcreative.com/graphite_fleet/

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Vite will print the local development URL.

## Build for a website

```bash
npm run build
```

Upload the contents of `dist/` to your web server. Asset paths are relative, so the game can live at a domain root or in a subdirectory such as `/graphite-fleet/`.

## Repository notes

- The game is client-side and does not require a database or backend service.
- The source release intentionally excludes the original hosted-Sites deployment identity and generated files.
- MIT License

## Design Process: AI-Assisted Development

Graphite Fleet began as an adaptation of a traditional pencil-and-paper space-combat game passed between classrooms, friends, professors and students. The goal was not simply to digitize its rules, but to preserve the feeling of plotting motion, committing to a decision and watching a battle record accumulate across the page.

I developed the project through a sustained conversation with OpenAI Codex. This was not a one-prompt exercise. I acted as creative director, game designer, systems designer, playtester and decision-maker; Codex acted as an implementation collaborator that could turn specific observations into working code, inspect bugs and help iterate quickly.

### Start with a playable question

The first question was simple: could the game feel like pencil-and-paper orbital combat while using a live browser interface?

That led to the initial pillars:

* Newtonian gravity-driven motion
* Persistent trajectories that become a visual battle record
* Ships, bases, asteroids, lasers and torpedoes
* Simultaneous command planning rather than reflex-based combat
* A dark “graphite plotting board” visual language

From there, the real design work began. Every feature had to support strategy, legibility and accessibility.

### Describe behavior, not just features

The most productive prompts were concrete observations from play and screenshots were submitted to Codex along with some of these:

> “The CPU is too shy and sends its ships around the outside instead of through the asteroid orbits.”

> “The command palette blocks vector views.”

> “This red ship probably should have shot my ship, but instead it is flying away.”

> “The base should defend itself against incoming torpedoes.”

Those are better than abstract requests such as “make the AI smarter.” They identify visible behavior, the context in which it happened and the intended feeling. Codex could then trace the relevant rules, implement a change and explain the result in terms I could test.

### Let playtesting change the rules

Several major systems changed because the initial version was not as clear or satisfying as it looked on paper.

The game originally experimented with stacked actions and “ghost” positions for multiple thrust commands. That created ambiguity: players could see multiple projected destinations, but the resolution logic did not always match the visual promise. The solution was to replace the system with a clearer rule: every deployed ship and each base receives one action per round. Un-commanded ships coast along their orbital trajectories, visibly labeled as such.

That change improved the game in several ways at once:

* The turn structure became easier to understand.
* Deployment became strategically meaningful because it trades base durability for another future action.
* The UI could show command-ready, committed and coasting assets clearly.
* The CPU could reason about the same action economy as the player.

This was an important lesson: when a feature creates repeated confusion, the right response may be to simplify the game rather than add more explanation.

### Use screenshots as evidence

Screenshots became part of the development conversation. They exposed issues that a code review alone would miss:

* A CPU fleet that had learned to survive but not attack.
* Torpedoes missing their intended targets or threatening friendly bases.
* A floating command palette obscuring useful trajectory information.
* Damage states disappearing during replay.
* Camera framing that made a tactical board hard to read.

The workflow was a loop:

1. Play a real match.
2. Capture the unexpected behavior.
3. Describe what felt wrong.
4. Identify the system rule behind it.
5. Implement and test a revision.
6. Play again.

That loop is the core of the project. AI shortened the implementation cycle, but human observation determined what counted as a problem and what a good result looked like.

### Build the CPU around goals and constraints

The CPU opponent evolved in stages.

At first it needed basic orbital awareness so it would not fly into the central planet. Once it learned that, it became too cautious: it found survivable orbits but did not meaningfully pursue the enemy. The next version needed tactical objectives, not just collision avoidance.

Its priorities eventually included:

* Avoiding the planet, asteroids and allied ships.
* Reaching attack corridors near enemy ships and bases.
* Favoring lasers for close ship-to-ship engagements.
* Using torpedoes when a trajectory had a credible chance of reaching the intended target.
* Avoiding friendly fire and defending its own base from incoming torpedoes or nearby threats.
* Becoming more direct when safe orbital behavior was preventing engagement.

The CPU is deterministic and uses the same physics, weapons and information available to a human player. It does not receive hidden bonuses. That makes its decisions inspectable and turns difficult behavior into an understandable design problem rather than a mystery.

### Treat accessibility and visual clarity as game mechanics

The interface was developed alongside the rules, not added at the end.

The final game includes a scalable interface, visible command status, keyboard controls, touch-friendly buttons, reduced-motion behavior, high-contrast dark mode, replay controls, smooth camera movement and readable history trails. Visual details such as open-circle laser misses, damage shown immediately on asteroids and ships, and larger shared explosion effects make the simulation easier to understand at a glance.

These details are not just cosmetic. In a game about predicting motion, the player needs to see what happened and why.

### What AI contributed

OpenAI Codex contributed implementation support throughout the project:

* Writing and restructuring React, TypeScript and CSS.
* Translating game-design requirements into simulation and interface logic.
* Tracing bugs through order entry, trajectory prediction and resolution.
* Refactoring the project into a cleaner portable source release.
* Supporting build validation, type checking and packaging.

### What remained human work

I directed the project throughout:

* Defining the concept, rules and visual identity.
* Deciding what to preserve from the folk-game inspiration.
* Evaluating whether a feature was clear, fun or strategically meaningful.
* Reading playtest behavior and identifying the real problem.
* Making decisions about balance, accessibility, aesthetics and scope.
* Testing the finished game and deciding when it was ready to share.

### A reusable method

For designers and developers interested in AI-assisted software work, the useful pattern is not “ask AI to build an app.” It is:

1. Build a small playable version.
2. Test it in the real context where it will be used.
3. Describe observed behavior precisely.
4. Ask for a targeted implementation change.
5. Verify the result against the original observation.
6. Simplify when the rules or interface become harder to explain than to use.
7. Keep authorship with the person who defines quality, priorities and meaning.

Graphite Fleet is an independent, noncommercial adaptation of a traditional pencil-and-paper space-combat game. It is also a record of an AI-assisted creative process: a human-directed cycle of imagination, implementation, observation, diagnosis and revision.
