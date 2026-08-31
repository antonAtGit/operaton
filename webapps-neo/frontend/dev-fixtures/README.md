# dev-fixtures

Synthetic processes and a load-generating bot for local Operaton development.
The aim is twofold:

- expose every BPMN 2.0 feature you'd plausibly meet in real projects, so the
  web-app code paths get exercised, and
- run thousands of instances on demand, so the dashboard, diagrams, and queries
  feel real instead of artisanal.

```
dev-fixtures/
├── processes/                    BPMN 2.0 files
│   ├── order-fulfillment.bpmn        service tasks · gateways · user task
│   ├── insurance-claim.bpmn          subprocess · boundary timer + error · DMN · compensation
│   ├── loan-approval.bpmn            message start · multi-instance · call activity · signal
│   ├── document-review.bpmn          event-based gateway · timer/message/signal race
│   └── risk-assessment.bpmn          (called by loan-approval)
├── rules/
│   └── claim-routing.dmn             called by insurance-claim
└── bot/                          Node 20+ load generator and CLIs
    ├── deploy.js                     deploy all *.bpmn / *.dmn
    ├── bot.js                        long-running worker bot
    ├── spawn.js                      manual instance creation
    ├── stress.js                     load profiles
    ├── seed-auth.js                  role groups, users and authorizations
    ├── config.json                   tunable knobs
    └── lib/                          internals (engine client, RNG, topics)
```

## Quickstart — pick a flavour

### A. All-in-one Docker (engine + bot + control panel)

```sh
# in webapps-neo/frontend
docker compose -f docker-compose.dev-fixtures.yaml up --build
```

Then:

- Engine + REST → <http://localhost:8084>
- Web app dev server (separate, `npm run dev`) → <http://localhost:5173>
- **Control panel** → <http://localhost:3001> (buttons for deploy / bot / spawn / stress)

### B. Engine in Docker, bot on the host (faster iteration on the bot)

```sh
# in webapps-neo/frontend
docker compose up -d                   # the existing engine-only compose
cd dev-fixtures/bot
npm run deploy
npm run bot                            # auto-spawns + workers + dispatcher
# or
npm run bot -- --no-spawner            # workers only, queue maintenance mode
# or
npm run bot -- --auto-deploy           # deploy + run, in one step
# or
npm run server                         # the same control panel as in (A), at :3000
```

## Spawning specific scenarios

```sh
# One Order Fulfillment with defaults
npm run spawn -- --process orderFulfillment

# Ten Loan Approval applications (started via message)
npm run spawn -- --message loan-application-received --count 10

# A specific scenario via vars
npm run spawn -- --process insuranceClaim --vars claimType=health,amount=12000
```

`--vars` accepts comma-separated `key=value`. Values that look like integers,
floats or `true`/`false` are typed accordingly; everything else is a string.

## Stress testing

Default profile is `default` (1000 instances, rampup):

```sh
npm run stress
```

Presets and overrides:

| flag                         | effect                                              |
| ---------------------------- | --------------------------------------------------- |
| `--preset tiny`              | 50 instances                                        |
| `--preset small`             | 100                                                 |
| `--preset default`           | 1000 _(default)_                                    |
| `--preset big`               | 10 000                                              |
| `--preset huge`              | 100 000 (bring snacks)                              |
| `--count N`                  | custom count, implies `--preset custom`             |
| `--mode burst`               | fire as fast as possible, then exit                 |
| `--mode rampup` _(default)_  | linearly increase rate over `--duration`            |
| `--mode soak`                | keep ~N concurrent for `--duration`, topping up     |
| `--duration 10m`             | rampup/soak window (`s`/`m`/`h` suffix)             |
| `--rate 60/min`              | spawn-rate cap                                      |
| `--process orderFulfillment` | restrict to one process key (default: weighted mix) |

Examples:

```sh
npm run stress -- --preset big --mode burst
npm run stress -- --count 5000 --mode rampup --duration 15m
npm run stress -- --preset big --mode soak --duration 1h
```

## Authorization scenarios

Everything above runs as `demo`, who is in `operaton-admin` and therefore sees
everything — which is exactly the wrong shape for testing anything
role-dependent. `seed-auth.js` seeds three role groups, four users and the
permissions that separate them.

```sh
cd webapps-neo/frontend
docker compose -f docker-compose.authorization.yaml up -d
cd dev-fixtures/bot
npm run deploy
npm run seed-auth
```

The regular `docker-compose.yaml` **will not do** here: it runs without engine
authorization, and then every permission check answers `true` for everybody, so
nothing is gated and nothing is visible. `seed-auth.js` detects that and warns.
The authorization compose file also disables the bundled invoice example, which
otherwise crashes the engine on startup once authorization is on.

### Who gets what

Password equals the user id. These are throwaway local fixtures.

| user    | groups                      | area (application id)          | can do inside                                       |
| ------- | --------------------------- | ------------------------------ | --------------------------------------------------- |
| `anna`  | `sachbearbeiter`            | Arbeitsbereich (`tasklist`)    | read/start processes, work on tasks, read decisions |
| `ben`   | `betrieb`                   | Cockpit (`cockpit`)            | read instances + history, migrate, suspend, batches |
| `carla` | `systemadmin`               | Administration (`admin`)       | users, groups, memberships, authorizations, tenants |
| `dora`  | `sachbearbeiter`, `betrieb` | Arbeitsbereich **and** Cockpit | the union of the two                                |
| `demo`  | `operaton-admin`            | all of them                    | everything — admins bypass the checks               |

`dora` exists to prove the areas are checked one by one rather than resolved
from a single role.

### The two layers, and why they are separate

The script seeds two kinds of authorization, and mixing them up is the usual
source of confusion:

1. **Application `ACCESS`** (`resourceType` 0, ids `tasklist` / `cockpit` /
   `admin`) — _may I see this area at all_. The web app's area navigation gates
   on exactly this, via
   `GET /authorization/check?permissionName=ACCESS&resourceName=application&resourceType=0&resourceId=cockpit`.
   The ids are the historical Camunda app ids on purpose, so a migrated
   installation keeps the app access it already granted.
2. **Resource authorizations** (process definition, task, deployment, user, …)
   — _what may I actually do once I am in there_. This is the engine's ordinary
   permission model and predates any of this.

They fail differently, which is the useful part: a user with only (1) reaches
the area and finds it empty, a user with only (2) can work but the area stays
shut. `carla` is the clean illustration — full administration rights, and zero
process definitions visible.

Re-running is safe; existing groups, users, memberships and grants are left
alone. `npm run seed-auth -- --verify-only` skips seeding and just prints the
access matrix.

> **Group ids are alphanumeric.** The engine's resource whitelist rejects
> `system-admin` outright (`'system-admin' is not a valid resource identifier`);
> only `operaton-admin` is exempt. Hence `systemadmin`.

## Reproducibility

Every random choice is forked off `config.seed`. Same seed + same code = same
sequence of process starts, completion delays, failure injections. Change the
seed in `config.json` if you want a fresh shuffle. The `spawn` and `stress`
CLIs xor the seed with `Date.now()` so manual runs don't collide with the bot's
deterministic stream.

## Control panel

`server.js` exposes the bot as a tiny HTTP service with a one-page UI under
`bot/public/`. Buttons map onto the CLIs:

| Button        | What runs                     |
| ------------- | ----------------------------- |
| Deploy        | `node deploy.js`              |
| Start bot     | `node bot.js [--auto-deploy]` |
| Stop bot      | `SIGTERM` to the bot child    |
| Spawn         | `node spawn.js …`             |
| Stress        | `node stress.js …`            |
| Cancel stress | `SIGTERM` to the stress child |

Recent jobs and their stdout are kept in memory (max 50) so you can scroll
back. Output for any job: `GET /api/jobs/<id>`.

## Environment variables

These override `config.json` (handy in containers):

| var                            | overrides              |
| ------------------------------ | ---------------------- |
| `DEV_FIXTURES_ENGINE_URL`      | `engine.url`           |
| `DEV_FIXTURES_ENGINE_USERNAME` | `engine.auth.username` |
| `DEV_FIXTURES_ENGINE_PASSWORD` | `engine.auth.password` |
| `DEV_FIXTURES_SEED`            | `seed`                 |
| `PORT`                         | server port (3000)     |

## Knobs in `config.json`

```jsonc
{
  "engine": { "url": "http://localhost:8084/engine-rest", "auth": { "username": "demo", "password": "demo" } },
  "seed": 42,
  "businessKeyPrefix": "loadgen-",                    // every started instance carries this prefix
  "spawner": {
    "instancesPerMinute": 60,                          // bot's auto-spawn rate
    "weights": { "orderFulfillment": 50, "loanApproval": 25, ... }
  },
  "userTaskCompleter": {
    "pollIntervalMs": 2000,
    "completionDelayMedianMs": 8000,                   // log-normal sample around this median
    "completionDelaySigma": 1.4,                       // wider = more variance
    "stallProbability": 0.05                           // % of tasks the bot leaves alone
  },
  "externalTask": {
    "lockDurationMs": 30000,
    "maxTasksPerFetch": 20,
    "pollIntervalMs": 500,
    "failureRatePerTopic": { "default": 0.01, "credit-check": 0.02, "charge-payment": 0.03 }
  },
  "messageDispatcher": {
    "intervalMs": 5000,
    "messages": {
      "loan-application-received": { "weight": 1, "vars": { "amount": "random:int:1000:50000", "credit": "random:enum:good,fair,poor" } }
    }
  }
}
```

`random:` value-spec mini-language:

- `random:int:lo:hi`
- `random:float:lo:hi`
- `random:enum:a,b,c`
- `random:bool[:p]`

Anything else is passed through as a literal value.

## Cleaning up

The bot tags every instance with `loadgen-...` in its business key, so you can
filter generated noise in the dashboard. To wipe everything generated:

```sh
# All running instances (any process)
curl -u demo:demo -X POST http://localhost:8084/engine-rest/process-instance/delete \
  -H 'Content-Type: application/json' \
  -d '{"processInstanceQuery":{}}'
```

Add `processDefinitionKey` to the query if you want to be more surgical.

## What this purposefully does _not_ cover (yet)

- Ad-hoc subprocesses, transactions with cancel boundaries, complex gateways —
  rarely used, easy to add when needed.
- Tenant scenarios — orthogonal, separate concern. (Authorization scenarios
  are covered now, see above.)
- Migrations — the existing migration page already handles that.
