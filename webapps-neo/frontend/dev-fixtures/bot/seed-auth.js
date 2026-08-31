#!/usr/bin/env node
// Seeds an authorization scenario: three role groups, four users, and the
// permissions that separate them. Fills the gap the README used to list under
// "does not cover" — the fixtures are otherwise all-or-nothing as `demo`.
//
// Two independent layers get seeded, and keeping them apart is the whole point:
//
//   1. Application ACCESS (resourceType 0, ids `tasklist` / `cockpit` /
//      `admin`) — may I see this area at all. This is what the web app's area
//      navigation gates on.
//   2. Resource authorizations (process definition, task, user, ...) — what I
//      may actually do once I am in there.
//
// A user with only (1) reaches an area and finds it empty; a user with only (2)
// can work but the area stays shut. Both are needed, and they fail differently.
//
// Requires an engine with authorization ENABLED, otherwise every check answers
// `true` and nothing is gated — `--verify` warns when it detects that. See the
// README section "Authorization scenarios" for the container flags.
//
// Idempotent: existing groups, users, memberships and grants are left alone.

import { load_config } from "./lib/config.js";
import { make_engine_client } from "./lib/engine.js";

// Engine resource type ids (org.operaton.bpm.engine.authorization.Resources).
const RESOURCE = {
  APPLICATION: 0,
  USER: 1,
  GROUP: 2,
  GROUP_MEMBERSHIP: 3,
  AUTHORIZATION: 4,
  PROCESS_DEFINITION: 6,
  TASK: 7,
  PROCESS_INSTANCE: 8,
  DEPLOYMENT: 9,
  DECISION_DEFINITION: 10,
  TENANT: 11,
  BATCH: 13,
};

const AUTH_TYPE_GRANT = 1;

// The web app's three areas, keyed by the engine application id they gate on.
// These ids are deliberately the historical cockpit/tasklist/admin ones, so an
// installation migrated from Camunda keeps the app access it already granted.
const AREAS = {
  tasklist: "Arbeitsbereich",
  cockpit: "Cockpit",
  admin: "Administration",
};

const ROLES = [
  {
    group: "sachbearbeiter",
    name: "Sachbearbeitung",
    area: "tasklist",
    grants: [
      [
        RESOURCE.PROCESS_DEFINITION,
        [
          "READ",
          "CREATE_INSTANCE",
          "READ_INSTANCE",
          "UPDATE_INSTANCE",
          "READ_TASK",
          "UPDATE_TASK",
          "TASK_WORK",
        ],
      ],
      [RESOURCE.PROCESS_INSTANCE, ["CREATE", "READ", "UPDATE"]],
      [RESOURCE.TASK, ["READ", "UPDATE", "TASK_WORK", "TASK_ASSIGN"]],
      [RESOURCE.DECISION_DEFINITION, ["READ", "CREATE_INSTANCE"]],
    ],
  },
  {
    group: "betrieb",
    name: "Betrieb",
    area: "cockpit",
    grants: [
      [
        RESOURCE.PROCESS_DEFINITION,
        [
          "READ",
          "READ_INSTANCE",
          "READ_HISTORY",
          "UPDATE_INSTANCE",
          "MIGRATE_INSTANCE",
          "SUSPEND",
          "SUSPEND_INSTANCE",
          "RETRY_JOB",
        ],
      ],
      [RESOURCE.PROCESS_INSTANCE, ["READ", "UPDATE", "DELETE", "RETRY_JOB"]],
      [RESOURCE.TASK, ["READ"]],
      [RESOURCE.DEPLOYMENT, ["READ"]],
      [RESOURCE.DECISION_DEFINITION, ["READ", "READ_HISTORY"]],
      [RESOURCE.BATCH, ["READ", "CREATE", "UPDATE"]],
    ],
  },
  {
    // No hyphen: the engine's resource whitelist is alphanumeric, and only
    // `operaton-admin` is exempt — `system-admin` is rejected outright.
    group: "systemadmin",
    name: "System-Administration",
    area: "admin",
    grants: [
      [RESOURCE.USER, ["READ", "CREATE", "UPDATE", "DELETE"]],
      [RESOURCE.GROUP, ["READ", "CREATE", "UPDATE", "DELETE"]],
      [RESOURCE.GROUP_MEMBERSHIP, ["CREATE", "DELETE"]],
      [RESOURCE.AUTHORIZATION, ["READ", "CREATE", "UPDATE", "DELETE"]],
      [RESOURCE.TENANT, ["READ", "CREATE", "UPDATE", "DELETE"]],
    ],
  },
];

// Password equals the id — these are local fixtures, never anything else.
const USERS = [
  {
    id: "anna",
    firstName: "Anna",
    lastName: "Arbeit",
    groups: ["sachbearbeiter"],
  },
  { id: "ben", firstName: "Ben", lastName: "Betrieb", groups: ["betrieb"] },
  {
    id: "carla",
    firstName: "Carla",
    lastName: "Admin",
    groups: ["systemadmin"],
  },
  // Two areas at once, to prove the checks are per-area and not a single role.
  {
    id: "dora",
    firstName: "Dora",
    lastName: "Doppelrolle",
    groups: ["sachbearbeiter", "betrieb"],
  },
];

const exists = async (client, path) => {
  try {
    await client.get(path);
    return true;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
};

const ensure_group = async (client, { group, name }) => {
  if (await exists(client, `/group/${group}`)) return "exists";
  await client.post("/group/create", { id: group, name, type: "WORKFLOW" });
  return "created";
};

const ensure_user = async (client, user) => {
  if (await exists(client, `/user/${user.id}/profile`)) return "exists";
  await client.post("/user/create", {
    profile: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    credentials: { password: user.id },
  });
  return "created";
};

const ensure_membership = async (client, group, user_id) => {
  // `memberOfGroup`, singular. The engine silently ignores an unknown query
  // parameter and answers with *every* user, which reads as "already a member"
  // and skips the membership for good.
  const members = await client.get(`/user?memberOfGroup=${group}`);
  if (members.some((m) => m.id === user_id)) return "exists";
  await client.put(`/group/${group}/members/${user_id}`);
  return "created";
};

const ensure_grant = async (
  client,
  group,
  resource_type,
  permissions,
  resource_id,
) => {
  const existing = await client.get(
    `/authorization?groupIdIn=${group}&resourceType=${resource_type}`,
  );
  if (existing.some((a) => a.resourceId === resource_id)) return "exists";
  await client.post("/authorization/create", {
    type: AUTH_TYPE_GRANT,
    permissions,
    groupId: group,
    resourceType: resource_type,
    resourceId: resource_id,
  });
  return "created";
};

const seed = async (client) => {
  for (const role of ROLES) {
    console.log(
      `\n${role.name}  (Gruppe ${role.group} → Bereich ${AREAS[role.area]})`,
    );
    console.log(
      `  group                     ${await ensure_group(client, role)}`,
    );
    // Layer 1: may I see the area.
    console.log(
      `  application ACCESS ${role.area.padEnd(9)} ` +
        (await ensure_grant(
          client,
          role.group,
          RESOURCE.APPLICATION,
          ["ACCESS"],
          role.area,
        )),
    );
    // Layer 2: what may I do inside it.
    for (const [resource_type, permissions] of role.grants) {
      const label = Object.keys(RESOURCE).find(
        (k) => RESOURCE[k] === resource_type,
      );
      console.log(
        `  resource ${label.toLowerCase().padEnd(19)} ` +
          (await ensure_grant(
            client,
            role.group,
            resource_type,
            permissions,
            "*",
          )),
      );
    }
  }

  console.log("\nUsers");
  for (const user of USERS) {
    const state = await ensure_user(client, user);
    const memberships = [];
    for (const group of user.groups) {
      memberships.push(
        `${group}:${await ensure_membership(client, group, user.id)}`,
      );
    }
    console.log(
      `  ${user.id.padEnd(8)} ${state.padEnd(8)} ${memberships.join("  ")}`,
    );
  }
};

const verify = async (config) => {
  console.log("\nApplication ACCESS per user (password = user id)\n");
  const header = ["user", ...Object.keys(AREAS)];
  console.log("  " + header.map((h) => h.padEnd(12)).join(""));
  console.log("  " + header.map(() => "-".repeat(10).padEnd(12)).join(""));

  let all_true = true;
  for (const user of USERS) {
    const as_user = make_engine_client({
      ...config,
      engine: {
        ...config.engine,
        auth: { username: user.id, password: user.id },
      },
    });
    const cells = [];
    for (const app of Object.keys(AREAS)) {
      let ok;
      try {
        const res = await as_user.get(
          `/authorization/check?permissionName=ACCESS&resourceName=application` +
            `&resourceType=${RESOURCE.APPLICATION}&resourceId=${app}`,
        );
        ok = res.authorized;
      } catch {
        ok = null;
      }
      if (!ok) all_true = false;
      cells.push(ok === null ? "error" : ok ? "yes" : "no");
    }
    console.log("  " + [user.id, ...cells].map((c) => c.padEnd(12)).join(""));
  }

  if (all_true) {
    console.log(
      "\n  WARNING: every user is authorized everywhere. The engine almost\n" +
        "  certainly runs with authorization DISABLED, in which case the check\n" +
        "  answers true for everyone and nothing is gated. See the README.",
    );
  }
};

const main = async () => {
  const config = await load_config();
  const client = make_engine_client(config);
  console.log(
    `Engine: ${config.engine.url}  (as ${config.engine.auth?.username ?? "anonymous"})`,
  );

  if (!process.argv.includes("--verify-only")) await seed(client);
  await verify(config);
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
