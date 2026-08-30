import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

// Domain model
type Vec = {
    x: number;
    y: number;
};
type ActionKind = "NONE" | "THRUST" | "TORPEDO" | "LASER" | "DEPLOY" | "CORRECT";
type Phase = "setup" | "ready" | "aiming" | "resolving" | "gameover";
type ViewMode = "tactical" | "history";
type ThemeMode = "dark";
type OpponentMode = "human" | "cpu";
type FleetSize = 3 | 6;
type GameSettings = {
    gravity: true;
    inertia: true;
    fleetSize: FleetSize;
    actionsPerCommander: 1;
    theme: ThemeMode;
    opponent: OpponentMode;
    colors: [
        string,
        string
    ];
    historyOpacity: number;
};
type Unit = {
    id: string;
    player: 0 | 1;
    kind: "ship" | "base";
    label: string;
    pos: Vec;
    vel: Vec;
    r: number;
    alive: boolean;
    deployed: boolean;
    armor: number;
    fuel: number;
    missiles: number;
    laserCooldown: number;
    heading: number;
};
type Missile = {
    id: string;
    player: 0 | 1;
    sourceId: string;
    pos: Vec;
    vel: Vec;
    r: number;
    alive: boolean;
    age: number;
    correctionAvailable: boolean;
};
type Asteroid = {
    id: string;
    orbitRadius: number;
    phase: number;
    r: number;
    direction: 1 | -1;
    alive: boolean;
    armor: number;
};
type CommandSource = Unit | Missile;
type PathEvent = {
    type: "path";
    objectKind: "ship" | "torpedo";
    objectId?: string;
    player: 0 | 1;
    turn: number;
    points: Vec[];
    phase?: number;
};
type LaserEvent = {
    type: "laser";
    player: 0 | 1;
    turn: number;
    from: Vec;
    to: Vec;
    hit?: boolean;
    phase?: number;
};
type ImpactEvent = {
    type: "impact";
    player: 0 | 1;
    turn: number;
    pos: Vec;
    heavy?: boolean;
    phase?: number;
};
type MarkerEvent = {
    type: "marker";
    player: 0 | 1;
    turn: number;
    pos: Vec;
    label: string;
};
type DestroyEvent = {
    type: "destroy";
    player: 0 | 1;
    turn: number;
    pos: Vec;
    label: string;
    base?: boolean;
    phase?: number;
};
type RockDestroyEvent = {
    type: "rock-destroy";
    player: 0 | 1;
    turn: number;
    pos: Vec;
    label: string;
    phase?: number;
};
type BaseStatusEvent = {
    type: "base-status";
    player: 0 | 1;
    turn: number;
    pos: Vec;
    baseArmor: number;
    shipArmors: number[];
};
type DamageEvent = {
    type: "damage";
    player: 0 | 1;
    turn: number;
    pos: Vec;
    id: string;
    armor: number;
    objectKind: "ship" | "base" | "asteroid";
    phase?: number;
};
type HistoryEvent = PathEvent | LaserEvent | ImpactEvent | MarkerEvent | DestroyEvent | RockDestroyEvent | BaseStatusEvent | DamageEvent;
type PendingOrder = {
    player: 0 | 1;
    sourceId: string;
    action: ActionKind;
    vector: Vec;
    markerPos: Vec;
    actorId: string;
    conditional?: boolean;
    ghostShipId?: string;
    arrivalPos?: Vec;
    arrivalVel?: Vec;
    arrivalPath?: Vec[];
    arrivalDoomed?: boolean;
};
type Game = {
    units: Unit[];
    missiles: Missile[];
    asteroids: Asteroid[];
    history: HistoryEvent[];
    currentPlayer: 0 | 1;
    turn: number;
    phase: Phase;
    selectedId: string;
    action: ActionKind;
    initiative: 0 | 1;
    actionInRound: number;
    winner: 0 | 1 | null;
    draw: boolean;
    nextMissileId: number;
    time: number;
    log: string[];
    settings: GameSettings;
    pendingOrders: PendingOrder[];
    planningComplete: [
        boolean,
        boolean
    ];
};
type Camera = {
    x: number;
    y: number;
    zoom: number;
};
type Aim = {
    pointerId: number | null;
    anchor: Vec;
    raw: Vec;
    power: number;
    previousRaw: Vec;
    previousPower: number;
    moved: boolean;
    keyboard: boolean;
};
type Telemetry = {
    speed: string;
    consequence: string;
    periapsis: string;
    closest: string;
    vector: string;
    impact: boolean;
};
type TimedEffect = {
    at: number;
    event: LaserEvent | ImpactEvent | DestroyEvent | RockDestroyEvent;
};
type TimedDeath = {
    at: number;
    id: string;
    kind: "unit" | "torpedo" | "asteroid";
};
type TimedDamage = {
    at: number;
    id: string;
    armor: number;
};
type TimedBirth = {
    at: number;
    id: string;
    kind: "torpedo";
};
type Resolution = {
    game: Game;
    tracks: Map<string, Vec[]>;
    duration: number;
    started: number;
    progress: number;
    lead: number;
    effects: TimedEffect[];
    deaths: TimedDeath[];
    damage: TimedDamage[];
    births: TimedBirth[];
};
type ReplayState = {
    active: boolean;
    progress: number;
    started: number;
    duration: number;
};
type CpuChoice = {
    sourceId: string;
    action: Exclude<ActionKind, "NONE">;
    raw: Vec;
    power: number;
    note: string;
};
// Simulation and presentation constants
const WORLD_W = 3000;
const WORLD_H = 2000;
const INTERVAL = 6;
const STEP = 0.06;
const STEPS = Math.round(INTERVAL / STEP);
const MAX_VECTOR_INPUT = 420;
const MAX_DV = 20;
const TORPEDO_SPEED_SCALE = .75;
const PAPER = "#eeeae0";
const PAPER_2 = "#e7e1d4";
const GRAPHITE = "#343638";
const DEFAULT_COLORS: [
    string,
    string
] = ["#2474a8", "#c65540"];
const COLOR_OPTIONS = [
    { name: "Teal", value: "#168b8b" }, { name: "Vermilion", value: "#c65540" },
    { name: "Indigo", value: "#5967c8" }, { name: "Gold", value: "#a36f00" },
    { name: "Plum", value: "#9a4b83" }, { name: "Blue", value: "#2474a8" },
];
const CENTRAL = { x: 1500, y: 1000, r: 180, mu: 820000 };
const DEFAULT_SETTINGS: GameSettings = { gravity: true, inertia: true, fleetSize: 3, actionsPerCommander: 1, theme: "dark", opponent: "human", colors: [...DEFAULT_COLORS], historyOpacity: 2 };
const HISTORY_LEVELS = [0, .22, .45, .68] as const;
const HISTORY_LABELS = ["Off", "Faint", "Medium", "Full"] as const;
// The former largest setting (1.3×) is now the midpoint. This makes the whole
// interface legible by default while preserving two larger accessibility steps.
const UI_SCALE_VALUES = [1, 1.15, 1.3, 1.45, 1.6] as const;
const UI_SCALE_LABELS = ["Compact", "Small", "Medium", "Large", "Extra large"] as const;
const INITIAL_TELEMETRY: Telemetry = { speed: "9.0 u/s", consequence: "BOUND", periapsis: "—", closest: "—", vector: "Δv 9.0 u/s", impact: false };
const ASTEROID_SEEDS: Asteroid[] = [
    { id: "R1", orbitRadius: 540, phase: -Math.PI / 2, r: 28, direction: 1, alive: true, armor: 2 },
    { id: "R2", orbitRadius: 540, phase: Math.PI / 2, r: 28, direction: 1, alive: true, armor: 2 },
    { id: "R3", orbitRadius: 820, phase: -.82, r: 34, direction: 1, alive: true, armor: 2 },
    { id: "R4", orbitRadius: 820, phase: Math.PI - .82, r: 34, direction: 1, alive: true, armor: 2 },
    { id: "R5", orbitRadius: 680, phase: .22, r: 30, direction: 1, alive: true, armor: 2 },
    { id: "R6", orbitRadius: 680, phase: Math.PI + .22, r: 30, direction: 1, alive: true, armor: 2 },
];
const cloneVec = (v: Vec): Vec => ({ x: v.x, y: v.y });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (v: Vec, n: number): Vec => ({ x: v.x * n, y: v.y * n });
const mag = (v: Vec) => Math.hypot(v.x, v.y);
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const distance = (a: Vec, b: Vec) => mag(sub(a, b));
const unitVec = (v: Vec): Vec => mag(v) > 1e-6 ? mul(v, 1 / mag(v)) : { x: 1, y: 0 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpVec = (a: Vec, b: Vec, t: number): Vec => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const vectorAngleDegrees = (v: Vec) => (Math.round((Math.atan2(v.y, v.x) * 180 / Math.PI + 360) % 360) + 360) % 360;
const vectorDirectionName = (v: Vec) => {
    const directions = ["right", "down-right", "down", "down-left", "left", "up-left", "up", "up-right"];
    return directions[Math.round(vectorAngleDegrees(v) / 45) % directions.length];
};
const vectorDescription = (v: Vec, power: number) => `${vectorAngleDegrees(v)} degrees, ${vectorDirectionName(v)}, ${Math.round(power * 100)} percent power`;
const hexRgb = (hex: string) => { const n = Number.parseInt(hex.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
const rotateVec = (v: Vec, radians: number): Vec => ({ x: v.x * Math.cos(radians) - v.y * Math.sin(radians), y: v.x * Math.sin(radians) + v.y * Math.cos(radians) });
const hash01 = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967295; };
const resolutionMotionProgress = (resolution: Resolution) => clamp((resolution.progress - resolution.lead) / Math.max(.001, 1 - resolution.lead), 0, 1);
// Shared destruction effect for bases, ships, and asteroids.
function drawBaseDestruction(ctx: CanvasRenderingContext2D, p: Vec, progress: number, alpha: number, color: string, scale = 1, wreck = true) {
    const t = clamp(progress, 0, 1);
    const flash = 1 - t;
    const rgb = hexRgb(color);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    if (flash > 0) {
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 56 + t * 34);
        glow.addColorStop(0, `rgba(255,250,210,${flash * alpha})`);
        glow.addColorStop(.2, `rgba(255,166,60,${flash * .86 * alpha})`);
        glow.addColorStop(1, "rgba(190,45,30,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 90, 0, Math.PI * 2);
        ctx.fill();
        for (let ring = 0; ring < 3; ring += 1) {
            const local = clamp(t * 1.5 - ring * .17, 0, 1);
            if (!local)
                continue;
            ctx.strokeStyle = `rgba(255,${170 - ring * 35},60,${(1 - local) * .9 * alpha})`;
            ctx.lineWidth = 4 - ring;
            ctx.beginPath();
            ctx.arc(0, 0, 16 + local * (54 + ring * 18), 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    for (let i = 0; i < 18; i += 1) {
        const a = i / 18 * Math.PI * 2 + hash01(`base-debris-${i}`) * .22;
        const speed = 42 + hash01(`base-speed-${i}`) * 62;
        const d = 9 + speed * t;
        const len = 7 + hash01(`base-length-${i}`) * 15;
        ctx.strokeStyle = i % 3 ? `rgba(${rgb},${(.35 + flash * .55) * alpha})` : `rgba(231,91,42,${(.45 + flash * .5) * alpha})`;
        ctx.lineWidth = i % 4 === 0 ? 3 : 1.6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * Math.max(5, d - len), Math.sin(a) * Math.max(5, d - len));
        ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
        ctx.stroke();
    }
    if (wreck) {
        ctx.globalAlpha = clamp((t - .18) * 2.2, .12, 1) * alpha;
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([6, 4]);
        for (let i = 0; i < 6; i += 1) {
            if (i === 1 || i === 4)
                continue;
            const a = -Math.PI / 2 + i * Math.PI / 3;
            const b = -Math.PI / 2 + (i + 1) * Math.PI / 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 31, Math.sin(a) * 31);
            ctx.lineTo(Math.cos(b) * 31, Math.sin(b) * 31);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.strokeStyle = "#d64c35";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-24, -24);
        ctx.lineTo(24, 24);
        ctx.moveTo(24, -24);
        ctx.lineTo(-24, 24);
        ctx.stroke();
    }
    ctx.restore();
}
const asteroidPosition = (asteroid: Asteroid, time: number): Vec => {
    const angularSpeed = Math.sqrt(CENTRAL.mu / asteroid.orbitRadius ** 3) * asteroid.direction;
    const angle = asteroid.phase + angularSpeed * time;
    return { x: CENTRAL.x + Math.cos(angle) * asteroid.orbitRadius, y: CENTRAL.y + Math.sin(angle) * asteroid.orbitRadius };
};
// Game creation and turn rules
function createGame(settings: GameSettings = DEFAULT_SETTINGS, phase: Phase = "setup"): Game {
    const units: Unit[] = [];
    const fleet = (player: 0 | 1, baseX: number, facing: number) => {
        const prefix = player === 0 ? "A" : "B";
        units.push({ id: `p${player}-base`, player, kind: "base", label: `${prefix}-BASE`, pos: { x: baseX, y: 1000 }, vel: { x: 0, y: 0 }, r: 52, alive: true, deployed: true, armor: settings.fleetSize * 3 + 1, fuel: 0, missiles: 0, laserCooldown: 0, heading: facing > 0 ? 0 : Math.PI });
        Array.from({ length: settings.fleetSize }).forEach((_, i) => {
            units.push({ id: `p${player}-s${i + 1}`, player, kind: "ship", label: `${prefix}-${i + 1}`, pos: { x: baseX, y: 1000 }, vel: { x: 0, y: 0 }, r: 22, alive: true, deployed: false, armor: 3, fuel: Number.POSITIVE_INFINITY, missiles: 4, laserCooldown: 0, heading: facing > 0 ? 0 : Math.PI });
        });
    };
    fleet(0, 290, 1);
    fleet(1, 2710, -1);
    return { units, missiles: [], asteroids: ASTEROID_SEEDS.map((asteroid) => ({ ...asteroid })), history: [], pendingOrders: [], planningComplete: [false, false], currentPlayer: 0, initiative: 0, actionInRound: 0, turn: 1, phase, selectedId: "p0-base", action: "LASER", winner: null, draw: false, nextMissileId: 1, time: 0, settings: { ...settings, actionsPerCommander: 1, colors: [...settings.colors] }, log: ["COMMANDER 1 has initiative.", "Each deployed ship and each base receives one action per round.", `All ${settings.fleetSize} ships begin inside each base.`, "Unassigned ships coast when their commander finishes planning.", "Base HP equals stored ship HP plus one core HP.", "A base may deploy or fire its laser.", "Ships carry four torpedoes; bases fire lasers only.", "Gravity and persistent inertia are active."] };
}
function cloneGame(game: Game): Game {
    return { ...game, settings: { ...game.settings, colors: [...game.settings.colors] }, planningComplete: [...game.planningComplete] as [
            boolean,
            boolean
        ], units: game.units.map((u) => ({ ...u, pos: cloneVec(u.pos), vel: cloneVec(u.vel) })), missiles: game.missiles.map((m) => ({ ...m, pos: cloneVec(m.pos), vel: cloneVec(m.vel) })), asteroids: game.asteroids.map((asteroid) => ({ ...asteroid })), history: [...game.history], pendingOrders: game.pendingOrders.map((order) => ({ ...order, vector: cloneVec(order.vector), markerPos: cloneVec(order.markerPos), arrivalPos: order.arrivalPos ? cloneVec(order.arrivalPos) : undefined, arrivalVel: order.arrivalVel ? cloneVec(order.arrivalVel) : undefined, arrivalPath: order.arrivalPath?.map(cloneVec) })), log: [...game.log] };
}
function reserveShipsFor(game: Game, player: 0 | 1) { return game.units.filter((u) => u.player === player && u.kind === "ship" && u.alive && !u.deployed); }
function healthiestReserveFor(game: Game, player: 0 | 1) { return reserveShipsFor(game, player).sort((a, b) => b.armor - a.armor || a.label.localeCompare(b.label))[0]; }
function deployedShipsFor(game: Game, player: 0 | 1) { return game.units.filter((u) => u.player === player && u.kind === "ship" && u.alive && u.deployed); }
function isTargetable(u: Unit) {
    return u.alive && (u.kind === "base" || u.deployed);
}
function isUnit(source: CommandSource): source is Unit {
    return "kind" in source;
}
function commandSource(game: Game, id = game.selectedId): CommandSource | undefined {
    return game.units.find((u) => u.id === id) ?? game.missiles.find((m) => m.id === id && m.alive);
}
function planningSource(game: Game, id = game.selectedId): CommandSource | undefined { return commandSource(game, id); }
function planningActors(game: Game, player: 0 | 1): Unit[] {
    return game.units.filter((unit) => unit.player === player && isTargetable(unit));
}
function actorForSource(game: Game, source: CommandSource): Unit | undefined {
    return isUnit(source) ? source : game.units.find((unit) => unit.id === source.sourceId && unit.kind === "ship" && isTargetable(unit));
}
function actorHasOrder(game: Game, actorId: string) { return game.pendingOrders.some((order) => order.actorId === actorId); }
function laserVector(game: Game, order: PendingOrder, source: Unit): Vec {
    const halfAngle = (source.kind === "base" ? 1 : 2) * Math.PI / 180;
    const a = hash01(`${game.turn}:${order.actorId}:${order.sourceId}:a`);
    const b = hash01(`${game.turn}:${order.actorId}:${order.sourceId}:b`);
    return rotateVec(order.vector, ((a + b) - 1) * halfAngle);
}
function sourceLabel(source: CommandSource) {
    return isUnit(source) ? source.label : `${source.id.toUpperCase()} TORPEDO`;
}
function actionLabel(action: ActionKind, source: CommandSource) {
    if (action !== "NONE")
        return action;
    return isUnit(source) && source.kind === "base" ? "NO ACTION" : "COAST";
}
// Physics, targeting, and collision detection
function accelerationAt(p: Vec): Vec {
    const d = sub(CENTRAL, p);
    const r = Math.max(35, mag(d));
    return mul(d, CENTRAL.mu / (r * r * r));
}
function verlet(pos: Vec, vel: Vec, dt: number, gravity: boolean) {
    const a0 = gravity ? accelerationAt(pos) : { x: 0, y: 0 };
    const nextPos = add(add(pos, mul(vel, dt)), mul(a0, .5 * dt * dt));
    const a1 = gravity ? accelerationAt(nextPos) : { x: 0, y: 0 };
    return { pos: nextPos, vel: add(vel, mul(add(a0, a1), .5 * dt)) };
}
function segmentCircle(a: Vec, b: Vec, c: Vec, r: number): number | null {
    const ab = sub(b, a);
    const denom = ab.x * ab.x + ab.y * ab.y;
    if (denom < 1e-9)
        return distance(a, c) <= r ? 0 : null;
    const t = clamp(((c.x - a.x) * ab.x + (c.y - a.y) * ab.y) / denom, 0, 1);
    return distance(add(a, mul(ab, t)), c) <= r ? t : null;
}
function solidCollision(game: Game, a: Vec, b: Vec, radius: number, startTime: number, endTime = startTime) {
    const solids = [
        { id: "planet", oldPos: CENTRAL, newPos: CENTRAL, r: CENTRAL.r },
        ...game.asteroids.filter((asteroid) => asteroid.alive).map((asteroid) => ({ id: asteroid.id, oldPos: asteroidPosition(asteroid, startTime), newPos: asteroidPosition(asteroid, endTime), r: asteroid.r })),
    ];
    let result: {
        solid: {
            id: string;
            pos: Vec;
            r: number;
        };
        t: number;
        point: Vec;
    } | null = null;
    for (const solid of solids) {
        const t = segmentCircle(sub(a, solid.oldPos), sub(b, solid.newPos), { x: 0, y: 0 }, solid.r + radius);
        if (t !== null && (!result || t < result.t))
            result = { solid: { id: solid.id, pos: lerpVec(solid.oldPos, solid.newPos, t), r: solid.r }, t, point: lerpVec(a, b, t) };
    }
    return result;
}
function lineTarget(game: Game, from: Vec, to: Vec, source: Unit) {
    const candidates: {
        type: "solid" | "unit" | "torpedo";
        id: string;
        pos: Vec;
        r: number;
    }[] = [
        { type: "solid", id: "planet", pos: CENTRAL, r: CENTRAL.r },
        ...game.asteroids.filter((asteroid) => asteroid.alive).map((asteroid) => ({ type: "solid" as const, id: asteroid.id, pos: asteroidPosition(asteroid, game.time), r: asteroid.r })),
        ...game.units.filter((unit) => isTargetable(unit) && unit.id !== source.id).map((unit) => ({ type: "unit" as const, id: unit.id, pos: unit.pos, r: unit.r })),
        ...game.missiles.filter((missile) => missile.alive).map((missile) => ({ type: "torpedo" as const, id: missile.id, pos: missile.pos, r: missile.r + 3 })),
    ];
    let result: {
        type: "solid" | "unit" | "torpedo";
        id: string;
        point: Vec;
        t: number;
    } | null = null;
    for (const candidate of candidates) {
        const t = segmentCircle(from, to, candidate.pos, candidate.r);
        if (t !== null && t > .001 && (!result || t < result.t))
            result = { type: candidate.type, id: candidate.id, point: lerpVec(from, to, t), t };
    }
    return result;
}
function applyDamage(game: Game, target: Unit, attacker: 0 | 1, events: HistoryEvent[], pos: Vec, damage: number, label: string) {
    events.push({ type: "impact", player: attacker, turn: game.turn, pos: cloneVec(pos), heavy: target.kind === "base" });
    if (target.kind === "base") {
        for (let point = 0; point < damage && target.armor > 0; point += 1) {
            const stored = reserveShipsFor(game, target.player)[0];
            if (stored) {
                stored.armor = Math.max(0, stored.armor - 1);
                if (stored.armor === 0) {
                    stored.alive = false;
                    game.log.unshift(`${stored.label} destroyed inside ${target.label} by ${label}.`);
                }
                else
                    game.log.unshift(`${stored.label} damaged inside ${target.label}; ${stored.armor} stored HP remains.`);
            }
            target.armor -= 1;
        }
    }
    else
        target.armor = Math.max(0, target.armor - damage);
    if (target.armor > 0) {
        game.log.unshift(`${target.label} took ${damage} HP from ${label}; ${target.armor} HP remains.`);
        return false;
    }
    target.alive = false;
    events.push({ type: "destroy", player: target.player, turn: game.turn, pos: cloneVec(target.pos), label: target.label, base: target.kind === "base" });
    game.log.unshift(`${target.label} destroyed by ${label}.`);
    return true;
}
function findOutcome(game: Game): {
    winner: 0 | 1 | null;
    draw: boolean;
} {
    const assetsRemain = ([0, 1] as const).map((player) => game.units.some((unit) => unit.player === player && isTargetable(unit)));
    if (!assetsRemain[0] && !assetsRemain[1])
        return { winner: null, draw: true };
    if (!assetsRemain[0])
        return { winner: 1, draw: false };
    if (!assetsRemain[1])
        return { winner: 0, draw: false };
    return { winner: null, draw: false };
}
function preferredUnit(game: Game, player: 0 | 1) {
    return deployedShipsFor(game, player)[0] ?? game.units.find((u) => u.player === player && u.kind === "base" && u.alive);
}
function actionDisabledReason(game: Game, source: CommandSource | undefined, action: ActionKind): string | null {
    if (game.phase !== "ready")
        return game.phase === "resolving" ? "Universe is resolving" : "Action phase is not ready";
    if (!source)
        return "No controllable object selected";
    const actor = actorForSource(game, source);
    if (!actor)
        return isUnit(source) ? "Asset is unavailable" : "Launching ship has been destroyed";
    if (actor.player !== game.currentPlayer)
        return "The other commander controls this asset";
    if (actorHasOrder(game, actor.id))
        return `${actor.label} already has an order this round`;
    if (action === "NONE")
        return null;
    if (action === "CORRECT" || !isUnit(source))
        return "Torpedo correction is not used in this ruleset";
    if (action === "DEPLOY") {
        if (source.kind !== "base")
            return "Select your base to deploy";
        return reserveShipsFor(game, source.player).length ? null : "No ships remain inside the base";
    }
    if (action === "THRUST") {
        if (source.kind === "base")
            return "Bases cannot thrust";
        return null;
    }
    if (action === "TORPEDO") {
        if (source.kind === "base")
            return "Bases do not carry torpedoes";
        return source.missiles > 0 ? null : "No torpedoes remaining";
    }
    return null;
}
function preferredAction(game: Game, source: CommandSource): ActionKind | null {
    const choices: ActionKind[] = isUnit(source) ? (source.kind === "ship" ? ["THRUST", "TORPEDO", "LASER"] : ["LASER", "DEPLOY"]) : [];
    return choices.find((action) => !actionDisabledReason(game, source, action)) ?? null;
}
function actionVector(action: ActionKind, raw: Vec, power: number, selected: CommandSource): Vec {
    const dir = mag(raw) > 1e-5 ? unitVec(raw) : { x: selected.player === 0 ? 1 : -1, y: 0 };
    if ((action === "THRUST" || action === "DEPLOY") && isUnit(selected))
        return mul(dir, MAX_DV * power);
    if (action === "TORPEDO")
        return mul(dir, lerp(34, 72, power) * TORPEDO_SPEED_SCALE);
    if (action === "CORRECT")
        return { x: 0, y: 0 };
    if (action === "NONE")
        return { x: 0, y: 0 };
    const laserRange = lerp(240, 1160, power);
    return mul(dir, isUnit(selected) && selected.kind === "ship" ? laserRange * 2 / 3 : laserRange);
}
// Preview paths use the same integrator and collision rules as resolution.
function previewPath(game: Game, selected: CommandSource, action: ActionKind, raw: Vec, power: number) {
    const applied = actionVector(action, raw, power, selected);
    if (action === "NONE")
        return { points: [cloneVec(selected.pos)], strongCount: 1, impact: null as Vec | null, targetGhost: null as Vec | null, applied };
    if (action === "LASER" && isUnit(selected)) {
        const from = cloneVec(selected.pos);
        const to = add(from, applied);
        const hit = lineTarget(game, from, to, selected);
        return { points: [from, hit?.point ?? to], strongCount: 2, impact: hit?.point ?? null, targetGhost: null as Vec | null, applied };
    }
    let pos = cloneVec(selected.pos);
    let vel = action === "DEPLOY" ? cloneVec(applied) : add(selected.vel, applied);
    if (action === "TORPEDO")
        pos = add(pos, mul(unitVec(applied), selected.r + 13));
    if (action === "DEPLOY")
        pos = add(pos, mul(unitVec(applied), selected.r + 31));
    const points = [cloneVec(pos)];
    let impact: Vec | null = null;
    let closest = Infinity;
    let targetGhost: Vec | null = null;
    const enemies = game.units.filter((u) => u.player !== selected.player && isTargetable(u));
    const collisionTargets = game.units.filter((u) => u.id !== selected.id && isTargetable(u));
    const dt = .12;
    const movingRadius = action === "TORPEDO" || action === "CORRECT" ? 9 : action === "DEPLOY" ? 22 : selected.r;
    for (let i = 0; i < Math.round(INTERVAL * 2 / dt); i += 1) {
        const old = pos;
        const next = verlet(pos, vel, dt, game.settings.gravity);
        pos = next.pos;
        vel = next.vel;
        if (i % 4 === 0)
            points.push(cloneVec(pos));
        const collision = solidCollision(game, old, pos, movingRadius, game.time + i * dt, game.time + (i + 1) * dt);
        let unitCollision: {
            point: Vec;
            t: number;
        } | null = null;
        for (const target of collisionTargets) {
            const oldTarget = add(target.pos, mul(target.vel, i * dt));
            const newTarget = add(target.pos, mul(target.vel, (i + 1) * dt));
            const hitT = segmentCircle(sub(old, oldTarget), sub(pos, newTarget), { x: 0, y: 0 }, movingRadius + target.r);
            if (hitT !== null && (!unitCollision || hitT < unitCollision.t))
                unitCollision = { point: lerpVec(old, pos, hitT), t: hitT };
        }
        const collisionPoint = unitCollision && (!collision || unitCollision.t <= collision.t) ? unitCollision.point : collision?.point;
        if (collisionPoint || pos.x < 0 || pos.y < 0 || pos.x > WORLD_W || pos.y > WORLD_H) {
            const impactPoint = collisionPoint ?? { x: clamp(pos.x, 0, WORLD_W), y: clamp(pos.y, 0, WORLD_H) };
            impact = impactPoint;
            points.push(cloneVec(impactPoint));
            break;
        }
        const t = (i + 1) * dt;
        enemies.forEach((enemy) => { const predicted = add(enemy.pos, mul(enemy.vel, t)); const d = distance(pos, predicted); if (d < closest) {
            closest = d;
            targetGhost = predicted;
        } });
    }
    return { points, strongCount: Math.ceil(points.length / 2), impact, targetGhost, applied };
}
function predictArrival(game: Game, ship: Unit, duration = INTERVAL): {
    pos: Vec;
    vel: Vec;
    path: Vec[];
    doomed: boolean;
} {
    let pos = cloneVec(ship.pos);
    let vel = cloneVec(ship.vel);
    let time = game.time;
    const path = [cloneVec(pos)];
    const steps = Math.round(duration / STEP);
    for (let step = 0; step < steps; step += 1) {
        const old = cloneVec(pos);
        const next = verlet(pos, vel, STEP, game.settings.gravity);
        pos = next.pos;
        vel = next.vel;
        const collision = solidCollision(game, old, pos, ship.r, time, time + STEP);
        time += STEP;
        if (step % 3 === 0 || step === steps - 1)
            path.push(cloneVec(pos));
        if (collision) {
            path.push(cloneVec(collision.point));
            return { pos: cloneVec(collision.point), vel, path, doomed: true };
        }
        if (pos.x < 0 || pos.y < 0 || pos.x > WORLD_W || pos.y > WORLD_H) {
            const boundary = { x: clamp(pos.x, 0, WORLD_W), y: clamp(pos.y, 0, WORLD_H) };
            path.push(boundary);
            return { pos: boundary, vel, path, doomed: true };
        }
    }
    return { pos, vel, path, doomed: false };
}
// Deterministic CPU planner. It receives no information unavailable to a player.
function isCpuTurn(game: Game) { return game.settings.opponent === "cpu" && game.currentPlayer === 1 && game.phase === "ready"; }
type CpuTrajectoryReport = {
    doomed: boolean;
    hitTarget: boolean;
    minPlanetClearance: number;
    minTargetDistance: number;
    minFriendlyClearance: number;
    finalPos: Vec;
    finalVel: Vec;
};
function cpuTrajectoryReport(game: Game, source: CommandSource, action: ActionKind, raw: Vec, power: number, horizon: number, target?: Unit, targetIgnoreSeconds = 0): CpuTrajectoryReport {
    const applied = actionVector(action, raw, power, source);
    let pos = cloneVec(source.pos);
    let vel = cloneVec(source.vel);
    let radius = source.r;
    if (action === "THRUST" || action === "CORRECT")
        vel = add(vel, applied);
    else if (action === "DEPLOY" && isUnit(source)) {
        const reserve = healthiestReserveFor(game, source.player);
        radius = reserve?.r ?? 22;
        pos = add(source.pos, mul(unitVec(applied), source.r + radius + 8));
        vel = cloneVec(applied);
    }
    else if (action === "TORPEDO" && isUnit(source)) {
        radius = 9;
        pos = add(source.pos, mul(unitVec(applied), source.r + 15));
        vel = add(source.vel, applied);
    }
    let minPlanetClearance = distance(pos, CENTRAL) - CENTRAL.r - radius;
    let minTargetDistance = Infinity;
    let minFriendlyClearance = Infinity;
    let targetPos = target ? cloneVec(target.pos) : null;
    let targetVel = target ? cloneVec(target.vel) : null;
    const dt = .24;
    let time = game.time;
    const friendlyStates = isUnit(source) ? game.units.filter((unit) => unit.player === source.player && unit.id !== source.id && isTargetable(unit)).map((unit) => { const pendingThrust = game.pendingOrders.find((order) => order.actorId === unit.id && order.action === "THRUST"); return { unit, pos: cloneVec(unit.pos), vel: pendingThrust ? add(unit.vel, pendingThrust.vector) : cloneVec(unit.vel), ignoreUntil: unit.kind === "base" && distance(source.pos, unit.pos) < source.r + unit.r + 28 ? 1.2 : 0 }; }) : [];
    for (let step = 0; step < Math.round(horizon / dt); step += 1) {
        const old = cloneVec(pos);
        const next = verlet(pos, vel, dt, game.settings.gravity);
        pos = next.pos;
        vel = next.vel;
        if (target && targetPos && targetVel && target.kind === "ship") {
            const targetNext = verlet(targetPos, targetVel, dt, game.settings.gravity);
            targetPos = targetNext.pos;
            targetVel = targetNext.vel;
        }
        friendlyStates.forEach((friend) => { if (friend.unit.kind === "ship") {
            const nextFriend = verlet(friend.pos, friend.vel, dt, game.settings.gravity);
            friend.pos = nextFriend.pos;
            friend.vel = nextFriend.vel;
        } if ((step + 1) * dt >= friend.ignoreUntil)
            minFriendlyClearance = Math.min(minFriendlyClearance, distance(pos, friend.pos) - radius - friend.unit.r); });
        const collision = solidCollision(game, old, pos, radius, time, time + dt);
        time += dt;
        minPlanetClearance = Math.min(minPlanetClearance, distance(pos, CENTRAL) - CENTRAL.r - radius);
        if (targetPos && time - game.time >= targetIgnoreSeconds) {
            minTargetDistance = Math.min(minTargetDistance, distance(pos, targetPos));
            if (minTargetDistance <= radius + target!.r)
                return { doomed: false, hitTarget: true, minPlanetClearance, minTargetDistance, minFriendlyClearance, finalPos: pos, finalVel: vel };
        }
        if (collision || pos.x < 0 || pos.y < 0 || pos.x > WORLD_W || pos.y > WORLD_H)
            return { doomed: true, hitTarget: false, minPlanetClearance, minTargetDistance, minFriendlyClearance, finalPos: pos, finalVel: vel };
    }
    return { doomed: false, hitTarget: false, minPlanetClearance, minTargetDistance, minFriendlyClearance, finalPos: pos, finalVel: vel };
}
function cpuMissileThreat(game: Game, missile: Missile, base: Unit) {
    const report = cpuTrajectoryReport(game, missile, "NONE", missile.vel, 0, INTERVAL * 10, base);
    return { missile, danger: report.minTargetDistance, threatening: report.minTargetDistance <= base.r + missile.r + 48 };
}
function cpuTorpedoSolution(game: Game, actor: Unit, target: Unit): {
    raw: Vec;
    power: number;
} | null {
    const desired = sub(add(target.pos, mul(target.vel, INTERVAL * 2)), actor.pos);
    const ownBase = game.units.find((unit) => unit.player === actor.player && unit.kind === "base" && unit.alive);
    const offsets = Array.from({ length: 31 }, (_, index) => -45 + index * 3);
    const powers = Array.from({ length: 16 }, (_, index) => .25 + index * .05);
    let best: {
        raw: Vec;
        power: number;
        score: number;
    } | null = null;
    for (const power of powers)
        for (const degrees of offsets) {
            const raw = mul(rotateVec(unitVec(desired), degrees * Math.PI / 180), MAX_VECTOR_INPUT);
            const intercept = cpuTrajectoryReport(game, actor, "TORPEDO", raw, power, INTERVAL * 18, target);
            if (!intercept.hitTarget)
                continue;
            if (ownBase) {
                const friendly = cpuTrajectoryReport(game, actor, "TORPEDO", raw, power, INTERVAL * 18, ownBase, 2);
                if (friendly.hitTarget || friendly.minTargetDistance < ownBase.r + 24)
                    continue;
            }
            const score = -intercept.minTargetDistance - Math.abs(degrees) * .12 - Math.abs(power - .74) * 2;
            if (!best || score > best.score)
                best = { raw, power, score };
        }
    return best ? { raw: best.raw, power: best.power } : null;
}
function cpuHitIsEnemy(game: Game, hit: ReturnType<typeof lineTarget>, player: 0 | 1) {
    if (!hit)
        return false;
    if (hit.type === "unit")
        return game.units.some((unit) => unit.id === hit.id && unit.player !== player && isTargetable(unit));
    if (hit.type === "torpedo")
        return game.missiles.some((missile) => missile.id === hit.id && missile.player !== player && missile.alive);
    return false;
}
function cpuOrbitalVelocity(source: Unit): Vec {
    const radial = unitVec(sub(source.pos, CENTRAL));
    const prograde = { x: -radial.y, y: radial.x };
    const direction = source.player === 1 ? -1 : 1;
    return mul(prograde, Math.sqrt(CENTRAL.mu / Math.max(CENTRAL.r + 90, distance(source.pos, CENTRAL))) * direction);
}
function cpuSafeVector(game: Game, source: CommandSource, action: ActionKind, desired: Vec, requestedPower: number, target?: Unit): {
    raw: Vec;
    power: number;
    safe: boolean;
} {
    const side = hash01(`${game.turn}:${source.id}:${action}:course`) < .5 ? -1 : 1;
    const offsets = [0, side * 12, -side * 12, side * 30, -side * 30, side * 55, -side * 55, side * 90, -side * 90];
    const powers = Array.from(new Set([requestedPower, 1, .7, .4, .22].map((value) => Math.round(clamp(value, .12, 1) * 100) / 100)));
    const horizon = action === "TORPEDO" ? INTERVAL * 7 : INTERVAL * 7;
    let best: {
        raw: Vec;
        power: number;
        score: number;
    } | null = null;
    for (const power of powers)
        for (const degrees of offsets) {
            const raw = mul(rotateVec(unitVec(desired), degrees * Math.PI / 180), MAX_VECTOR_INPUT);
            const report = cpuTrajectoryReport(game, source, action, raw, power, horizon, target);
            if (report.doomed || report.minPlanetClearance < (action === "TORPEDO" ? 18 : 24) || (action === "THRUST" || action === "DEPLOY") && report.minFriendlyClearance < 34)
                continue;
            let score = clamp(report.minPlanetClearance, 0, 180) / 120 - Math.abs(degrees) / 65 - Math.abs(power - requestedPower);
            if (target && Number.isFinite(report.minTargetDistance))
                score -= report.minTargetDistance / 135;
            if ((action === "THRUST" || action === "DEPLOY") && isUnit(source)) {
                const radial = unitVec(sub(report.finalPos, CENTRAL));
                const tangent = mul({ x: -radial.y, y: radial.x }, source.player === 1 ? -1 : 1);
                const circularSpeed = Math.sqrt(CENTRAL.mu / Math.max(CENTRAL.r + 90, distance(report.finalPos, CENTRAL)));
                // Orbital quality is a stabilizer, not the mission. A safe transfer that
                // closes on an enemy should beat a pristine orbit that never engages.
                score -= Math.abs(dot(report.finalVel, radial)) / 14;
                score -= Math.abs(dot(report.finalVel, tangent) - circularSpeed) / 18;
            }
            if (!best || score > best.score)
                best = { raw, power, score };
        }
    return best ? { raw: best.raw, power: best.power, safe: true } : { raw: mul(unitVec(desired), MAX_VECTOR_INPUT), power: clamp(requestedPower, .12, 1), safe: false };
}
function cpuChoiceForActor(game: Game, actor: Unit): CpuChoice | null {
    const enemies = game.units.filter((unit) => unit.player === 0 && isTargetable(unit));
    const baseTarget = enemies.find((unit) => unit.kind === "base");
    const nearestShip = enemies.filter((unit) => unit.kind === "ship").sort((a, b) => distance(actor.pos, a.pos) - distance(actor.pos, b.pos))[0];
    const target = nearestShip && distance(actor.pos, nearestShip.pos) < 1250 ? nearestShip : baseTarget ?? nearestShip;
    if (!target)
        return null;
    const direct = sub(target.pos, actor.pos);
    if (actor.kind === "base") {
        const threats = game.missiles.filter((missile) => missile.alive).map((missile) => cpuMissileThreat(game, missile, actor)).filter((entry) => entry.threatening).sort((a, b) => a.danger - b.danger);
        for (const { missile } of threats) {
            const intercept = sub(add(missile.pos, mul(missile.vel, .45)), actor.pos);
            const shot = actionVector("LASER", intercept, 1, actor);
            const hit = lineTarget(game, actor.pos, add(actor.pos, shot), actor);
            if (hit?.type === "torpedo" && hit.id === missile.id)
                return { sourceId: actor.id, action: "LASER", raw: mul(unitVec(intercept), MAX_VECTOR_INPUT), power: 1, note: `${actor.label} is destroying a torpedo predicted to strike the base.` };
        }
        const shot = actionVector("LASER", direct, 1, actor);
        const hit = lineTarget(game, actor.pos, add(actor.pos, shot), actor);
        if (cpuHitIsEnemy(game, hit, actor.player))
            return { sourceId: actor.id, action: "LASER", raw: mul(unitVec(direct), MAX_VECTOR_INPUT), power: 1, note: `${actor.label} is calculating a long-range laser shot.` };
        const reserves = reserveShipsFor(game, actor.player);
        const deployed = deployedShipsFor(game, actor.player).length;
        const deploymentGoal = Math.min(game.settings.fleetSize, Math.max(2, Math.ceil(game.settings.fleetSize / 2)));
        if (reserves.length && deployed < deploymentGoal) {
            const orbital = cpuOrbitalVelocity(actor);
            const vector = cpuSafeVector(game, actor, "DEPLOY", orbital, 1);
            if (vector.safe)
                return { sourceId: actor.id, action: "DEPLOY", raw: vector.raw, power: vector.power, note: `${actor.label} is plotting a long-horizon orbital deployment.` };
        }
        return null;
    }
    const ownBase = game.units.find((unit) => unit.player === actor.player && unit.kind === "base" && unit.alive);
    if (ownBase) {
        const threats = game.missiles.filter((missile) => missile.alive).map((missile) => cpuMissileThreat(game, missile, ownBase)).filter((entry) => entry.threatening).sort((a, b) => a.danger - b.danger);
        for (const { missile } of threats) {
            const intercept = sub(add(missile.pos, mul(missile.vel, .35)), actor.pos);
            const shot = actionVector("LASER", intercept, 1, actor);
            const hit = lineTarget(game, actor.pos, add(actor.pos, shot), actor);
            if (hit?.type === "torpedo" && hit.id === missile.id)
                return { sourceId: actor.id, action: "LASER", raw: mul(unitVec(intercept), MAX_VECTOR_INPUT), power: 1, note: `${actor.label} is screening the base from ${missile.id.toUpperCase()}.` };
        }
    }
    const laser = actionVector("LASER", direct, 1, actor);
    const laserHit = lineTarget(game, actor.pos, add(actor.pos, laser), actor);
    if (cpuHitIsEnemy(game, laserHit, actor.player))
        return { sourceId: actor.id, action: "LASER", raw: mul(unitVec(direct), MAX_VECTOR_INPUT), power: 1, note: `${actor.label} is choosing a high-confidence laser shot on ${target.label}.` };
    const torpedoesCommitted = game.pendingOrders.filter((order) => order.player === actor.player && order.action === "TORPEDO").length;
    if (actor.missiles > 0 && baseTarget && torpedoesCommitted === 0 && distance(actor.pos, baseTarget.pos) < 1700) {
        const launch = cpuTorpedoSolution(game, actor, baseTarget);
        if (launch)
            return { sourceId: actor.id, action: "TORPEDO", raw: launch.raw, power: launch.power, note: `${actor.label} found a predicted torpedo collision with ${baseTarget.label}.` };
    }
    const orbital = cpuOrbitalVelocity(actor);
    const interceptVelocity = mul(unitVec(sub(add(target.pos, mul(target.vel, INTERVAL * 1.4)), actor.pos)), Math.max(14, mag(orbital)));
    const desiredVelocity = add(mul(orbital, .2), mul(interceptVelocity, .8));
    const deltaV = sub(desiredVelocity, actor.vel);
    const coast = cpuTrajectoryReport(game, actor, "NONE", actor.vel, 0, INTERVAL * 7, target);
    if (!coast.doomed && coast.minPlanetClearance > 55 && coast.minTargetDistance < 620 && mag(deltaV) < 2.5)
        return null;
    const vector = cpuSafeVector(game, actor, "THRUST", deltaV, clamp(mag(deltaV) / MAX_DV, .28, 1), target);
    return vector.safe ? { sourceId: actor.id, action: "THRUST", raw: vector.raw, power: vector.power, note: `${actor.label} is crossing the asteroid lanes toward ${target.label}.` } : null;
}
// Flight-computer readouts
function orbitalTelemetry(pos: Vec, vel: Vec, impact: boolean) {
    const rVec = sub(pos, CENTRAL);
    const r = mag(rVec);
    const energy = mag(vel) ** 2 / 2 - CENTRAL.mu / r;
    const h = rVec.x * vel.y - rVec.y * vel.x;
    const e = Math.sqrt(Math.max(0, 1 + 2 * energy * h * h / (CENTRAL.mu * CENTRAL.mu)));
    const periapsis = h * h / (CENTRAL.mu * (1 + e)) - CENTRAL.r;
    return { consequence: impact || periapsis <= 0 ? "IMPACT" : energy < 0 ? "BOUND" : "ESCAPE", periapsis };
}
// React interface and canvas renderer
function GraphiteFleet() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Game>(createGame(DEFAULT_SETTINGS, "setup"));
    const cameraRef = useRef<Camera>({ x: 560, y: 1000, zoom: .72 });
    const aimRef = useRef<Aim>({ pointerId: null, anchor: { x: 0, y: 0 }, raw: { x: 1, y: 0 }, power: .45, previousRaw: { x: 1, y: 0 }, previousPower: .45, moved: false, keyboard: true });
    const resolutionRef = useRef<Resolution | null>(null);
    const replayRef = useRef<ReplayState>({ active: false, progress: 0, started: 0, duration: 0 });
    const pointerMap = useRef(new Map<number, Vec>());
    const panRef = useRef<{
        pointerId: number;
        start: Vec;
        camera: Camera;
    } | null>(null);
    const pinchRef = useRef<{
        ids: number[];
        distance: number;
        midpoint: Vec;
        camera: Camera;
    } | null>(null);
    const rafRef = useRef(0);
    const cameraRafRef = useRef(0);
    const resolutionTimeoutRef = useRef(0);
    const cpuTimerRef = useRef(0);
    const cpuCommitTimerRef = useRef(0);
    const cpuThinkingRef = useRef(false);
    const canvasSize = useRef({ width: 1, height: 1, dpr: 1 });
    const telemetryRef = useRef<Telemetry>({ ...INITIAL_TELEMETRY });
    const reducedMotion = useRef(false);
    const [gameView, setGameView] = useState<Game>(() => createGame(DEFAULT_SETTINGS, "setup"));
    const [telemetryView, setTelemetryView] = useState<Telemetry>({ ...INITIAL_TELEMETRY });
    const [viewMode, setViewMode] = useState<ViewMode>("tactical");
    const [power, setPower] = useState(.45);
    const [vectorView, setVectorView] = useState<Vec>({ x: 1, y: 0 });
    const [settingsDraft, setSettingsDraft] = useState<GameSettings>({ ...DEFAULT_SETTINGS, colors: [...DEFAULT_SETTINGS.colors] });
    const [liveMessage, setLiveMessage] = useState("Choose the match format.");
    const [replayActive, setReplayActive] = useState(false);
    const [gameoverMinimized, setGameoverMinimized] = useState(false);
    const [uiScale, setUiScale] = useState(2);
    const bump = useCallback(() => {
        setGameView(cloneGame(gameRef.current));
        setTelemetryView({ ...telemetryRef.current });
        setVectorView(cloneVec(aimRef.current.raw));
    }, []);
    const fitZoom = useCallback(() => {
        const { width, height } = canvasSize.current;
        return Math.min(width / WORLD_W, height / WORLD_H) * .94;
    }, []);
    const defaultZoom = useCallback(() => {
        const { width, height } = canvasSize.current;
        return clamp(Math.min(width / 1120, height / 790), fitZoom(), 1.05);
    }, [fitZoom]);
    const clampCamera = useCallback((camera: Camera) => {
        const { width, height } = canvasSize.current;
        const min = fitZoom();
        camera.zoom = clamp(camera.zoom, min, 1.5);
        const halfW = width / (2 * camera.zoom);
        const halfH = height / (2 * camera.zoom);
        camera.x = halfW * .4 > WORLD_W / 2 ? WORLD_W / 2 : clamp(camera.x, halfW * .4, WORLD_W - halfW * .4);
        camera.y = halfH * .4 > WORLD_H / 2 ? WORLD_H / 2 : clamp(camera.y, halfH * .4, WORLD_H - halfH * .4);
    }, [fitZoom]);
    const commanderCamera = useCallback((game: Game, player: 0 | 1): Camera => {
        const friendlyPoints: Vec[] = [
            ...game.units.filter((unit) => unit.player === player && isTargetable(unit)).map((unit) => unit.pos),
            ...game.missiles.filter((missile) => missile.player === player && missile.alive).map((missile) => missile.pos),
            ...game.pendingOrders.filter((order) => order.player === player && order.arrivalPos).map((order) => order.arrivalPos!),
        ];
        if (!friendlyPoints.length)
            return { ...cameraRef.current };
        const enemyAssets = [
            ...game.units.filter((unit) => unit.player !== player && isTargetable(unit)).map((unit) => unit.pos),
            ...game.missiles.filter((missile) => missile.player !== player && missile.alive).map((missile) => missile.pos),
        ].sort((a, b) => Math.min(...friendlyPoints.map((point) => distance(point, a))) - Math.min(...friendlyPoints.map((point) => distance(point, b))));
        const points = [...friendlyPoints, ...enemyAssets.slice(0, 2)];
        const minX = Math.min(...points.map((point) => point.x));
        const maxX = Math.max(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxY = Math.max(...points.map((point) => point.y));
        const { width, height } = canvasSize.current;
        const padding = 180;
        const zoom = clamp(Math.min(width / Math.max(420, maxX - minX + padding * 2), height / Math.max(360, maxY - minY + padding * 2)), fitZoom(), 1.15);
        const camera = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom };
        clampCamera(camera);
        return camera;
    }, [clampCamera, fitZoom]);
    const worldToScreen = useCallback((p: Vec, camera = cameraRef.current): Vec => {
        const { width, height } = canvasSize.current;
        return { x: (p.x - camera.x) * camera.zoom + width / 2, y: (p.y - camera.y) * camera.zoom + height / 2 };
    }, []);
    const screenToWorld = useCallback((p: Vec, camera = cameraRef.current): Vec => {
        const { width, height } = canvasSize.current;
        return { x: (p.x - width / 2) / camera.zoom + camera.x, y: (p.y - height / 2) / camera.zoom + camera.y };
    }, []);
    const vectorControlRadius = useCallback(() => {
        const { width, height } = canvasSize.current;
        return clamp(Math.min(width, height) * .23, 96, 170);
    }, []);
    const animatedPosition = useCallback((id: string, fallback: Vec) => {
        const resolution = resolutionRef.current;
        const track = resolution?.tracks.get(id);
        if (!resolution || !track?.length)
            return fallback;
        const f = resolutionMotionProgress(resolution) * (track.length - 1);
        const i = Math.floor(f);
        return lerpVec(track[i], track[Math.min(i + 1, track.length - 1)], f - i);
    }, []);
    const animatedHeading = useCallback((id: string, fallback: number) => {
        const resolution = resolutionRef.current;
        const track = resolution?.tracks.get(id);
        if (!resolution || !track || track.length < 2)
            return fallback;
        const f = resolutionMotionProgress(resolution) * (track.length - 1);
        const i = Math.min(Math.floor(f), track.length - 2);
        const delta = sub(track[i + 1], track[i]);
        return mag(delta) > .01 ? Math.atan2(delta.y, delta.x) : fallback;
    }, []);
    const drawGrid = useCallback((ctx: CanvasRenderingContext2D, camera: Camera) => {
        const { width, height } = canvasSize.current;
        const dark = gameRef.current.settings.theme === "dark";
        ctx.fillStyle = dark ? "#10171c" : PAPER;
        ctx.fillRect(0, 0, width, height);
        const a = screenToWorld({ x: 0, y: 0 }, camera);
        const b = screenToWorld({ x: width, y: height }, camera);
        const lines = (step: number, color: string) => {
            ctx.beginPath();
            for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step) {
                const sx = worldToScreen({ x, y: 0 }, camera).x;
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, height);
            }
            for (let y = Math.floor(a.y / step) * step; y <= b.y; y += step) {
                const sy = worldToScreen({ x: 0, y }, camera).y;
                ctx.moveTo(0, sy);
                ctx.lineTo(width, sy);
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.stroke();
        };
        if (camera.zoom > .32)
            lines(50, dark ? "rgba(103,215,210,.08)" : "rgba(79,116,129,.12)");
        lines(250, dark ? "rgba(103,215,210,.15)" : "rgba(61,96,110,.20)");
        const tl = worldToScreen({ x: 0, y: 0 }, camera);
        const br = worldToScreen({ x: WORLD_W, y: WORLD_H }, camera);
        ctx.strokeStyle = dark ? "rgba(220,235,233,.5)" : "rgba(38,49,54,.55)";
        ctx.lineWidth = 2;
        ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }, [screenToWorld, worldToScreen]);
    const drawHistory = useCallback((ctx: CanvasRenderingContext2D, camera: Camera, mode: ViewMode) => {
        const game = gameRef.current;
        const replay = replayRef.current;
        const maxTurn = Math.max(1, ...game.history.map((event) => event.turn));
        const replayTurn = replay.progress * maxTurn;
        const tacticalOpacity = HISTORY_LEVELS[game.settings.historyOpacity] ?? 0;
        if (!replay.active && mode !== "history" && tacticalOpacity <= 0)
            return;
        const dark = game.settings.theme === "dark";
        const graphiteRgb = dark ? "205,216,214" : "49,53,54";
        game.history.forEach((event) => {
            const eventPhase = replay.active ? replayTurn - (event.turn - 1) : 1;
            if (eventPhase <= 0)
                return;
            if (replay.active && "phase" in event && event.phase !== undefined && eventPhase < event.phase)
                return;
            const age = Math.max(0, game.turn - event.turn);
            const alpha = replay.active || mode === "history" ? clamp(.86 - age * .018, .32, .86) : clamp(.68 - age * .06, .12, .68) * tacticalOpacity / .68;
            if (event.type === "path") {
                const visibleCount = replay.active ? Math.max(2, Math.ceil(event.points.length * clamp(eventPhase, 0, 1))) : event.points.length;
                const visiblePoints = event.points.slice(0, visibleCount);
                if (visiblePoints.length < 2)
                    return;
                ctx.save();
                const trailRgb = hexRgb(game.settings.colors[event.player]);
                const trailAlpha = event.objectKind === "torpedo" ? alpha : alpha * (dark ? .82 : .68);
                ctx.strokeStyle = `rgba(${trailRgb},${trailAlpha})`;
                ctx.lineWidth = event.objectKind === "torpedo" ? 1.45 : 1.15;
                if (event.objectKind === "torpedo")
                    ctx.setLineDash([7, 7]);
                ctx.beginPath();
                visiblePoints.forEach((p, i) => { const s = worldToScreen(p, camera); if (i)
                    ctx.lineTo(s.x, s.y);
                else
                    ctx.moveTo(s.x, s.y); });
                ctx.stroke();
                ctx.setLineDash([]);
                for (let i = 8; i < visiblePoints.length; i += 12) {
                    const p = worldToScreen(visiblePoints[i], camera);
                    const q = worldToScreen(visiblePoints[i - 1], camera);
                    const d = unitVec(sub(p, q));
                    const n = { x: -d.y, y: d.x };
                    ctx.fillStyle = `rgba(${trailRgb},${trailAlpha})`;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x - d.x * 6 + n.x * 3, p.y - d.y * 6 + n.y * 3);
                    ctx.lineTo(p.x - d.x * 6 - n.x * 3, p.y - d.y * 6 - n.y * 3);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
            }
            else if (event.type === "laser") {
                if (replay.active && eventPhase < .08)
                    return;
                const a = worldToScreen(event.from, camera);
                const b = worldToScreen(event.to, camera);
                ctx.save();
                ctx.strokeStyle = `rgba(${hexRgb(game.settings.colors[event.player])},${clamp(alpha + .15, 0, 1)})`;
                ctx.lineWidth = age < 2 ? 2.8 : 1.5;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
                ctx.restore();
                if (event.hit === false) {
                    ctx.save();
                    ctx.strokeStyle = `rgba(${hexRgb(game.settings.colors[event.player])},${clamp(alpha + .15, 0, 1)})`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
            }
            else if (event.type === "impact") {
                if (replay.active && eventPhase < .1)
                    return;
                const p = worldToScreen(event.pos, camera);
                const r = event.heavy ? 13 : 8;
                ctx.save();
                ctx.strokeStyle = `rgba(185,54,42,${alpha})`;
                ctx.lineWidth = 1.5;
                for (let i = 0; i < 8; i += 1) {
                    const a = i * Math.PI / 4;
                    ctx.beginPath();
                    ctx.moveTo(p.x + Math.cos(a) * 2, p.y + Math.sin(a) * 2);
                    ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
                    ctx.stroke();
                }
                ctx.restore();
            }
            else if (event.type === "marker") {
                const p = worldToScreen(event.pos, camera);
                ctx.save();
                ctx.fillStyle = `rgba(${graphiteRgb},${alpha})`;
                ctx.font = "700 9px ui-monospace,monospace";
                ctx.beginPath();
                ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = dark ? "#10171c" : PAPER;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(event.turn), p.x, p.y + .5);
                ctx.restore();
            }
            else if (event.type === "rock-destroy") {
                if (replay.active && eventPhase < .1)
                    return;
                const p = worldToScreen(event.pos, camera);
                drawBaseDestruction(ctx, p, 1, alpha, game.settings.colors[event.player], .58, false);
                ctx.save();
                ctx.font = "700 8px ui-monospace,monospace";
                ctx.fillStyle = "#d9a071";
                ctx.fillText(`${event.label} DESTROYED`, p.x + 22, p.y + 3);
                ctx.restore();
            }
            else if (event.type === "base-status" || event.type === "damage")
                return;
            else {
                if (replay.active && eventPhase < .1)
                    return;
                const p = worldToScreen(event.pos, camera);
                if (event.base) {
                    const burstProgress = replay.active && !reducedMotion.current ? clamp((eventPhase - (event.phase ?? 0)) * 4, 0, 1) : 1;
                    drawBaseDestruction(ctx, p, burstProgress, alpha, game.settings.colors[event.player]);
                    ctx.save();
                    ctx.font = "800 9px ui-monospace,monospace";
                    ctx.fillStyle = dark ? "#f08a64" : "#8e3027";
                    ctx.fillText(`${event.label} DESTROYED`, p.x + 48, p.y + 4);
                    ctx.restore();
                }
                else {
                    drawBaseDestruction(ctx, p, 1, alpha, game.settings.colors[event.player], .5, false);
                    ctx.save();
                    ctx.font = "700 8px ui-monospace,monospace";
                    ctx.fillStyle = game.settings.colors[event.player];
                    ctx.fillText(event.label, p.x + 20, p.y + 3);
                    ctx.restore();
                }
            }
        });
    }, [worldToScreen]);
    const drawReplayMarkers = useCallback((ctx: CanvasRenderingContext2D, camera: Camera) => {
        const game = gameRef.current;
        const replay = replayRef.current;
        if (!replay.active || !game.history.length)
            return;
        const maxTurn = Math.max(1, ...game.history.map((event) => event.turn));
        const replayTurn = replay.progress * maxTurn;
        const turn = clamp(Math.floor(Math.min(replayTurn, maxTurn - .0001)) + 1, 1, maxTurn);
        const local = replayTurn >= maxTurn ? 1 : clamp(replayTurn - Math.floor(replayTurn), 0, 1);
        game.history.filter((event): event is PathEvent => event.type === "path" && event.turn === turn && event.points.length > 1).forEach((event) => {
            const index = local * (event.points.length - 1);
            const low = Math.floor(index);
            const pos = lerpVec(event.points[low], event.points[Math.min(low + 1, event.points.length - 1)], index - low);
            const p = worldToScreen(pos, camera);
            const next = event.points[Math.min(low + 1, event.points.length - 1)];
            const previous = event.points[Math.max(0, low - 1)];
            const heading = Math.atan2(next.y - previous.y, next.x - previous.x);
            const color = game.settings.colors[event.player];
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(heading);
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            if (event.objectKind === "torpedo") {
                ctx.fillRect(-5, -2, 10, 4);
                ctx.beginPath();
                ctx.moveTo(6, 0);
                ctx.lineTo(2, -4);
                ctx.lineTo(2, 4);
                ctx.closePath();
                ctx.fill();
            }
            else {
                const r = 10;
                const armor = game.history.filter((candidate): candidate is DamageEvent => candidate.type === "damage" && candidate.id === event.objectId && candidate.turn - 1 + (candidate.phase ?? 0) <= replayTurn).at(-1)?.armor ?? 3;
                const trace = () => { ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * .72, r * .62); ctx.lineTo(-r * .45, 0); ctx.lineTo(-r * .72, -r * .62); ctx.closePath(); };
                trace();
                ctx.fillStyle = "#10171c";
                ctx.fill();
                if (armor >= 3) {
                    trace();
                    ctx.fillStyle = color;
                    ctx.fill();
                }
                else if (armor === 2) {
                    ctx.save();
                    trace();
                    ctx.clip();
                    ctx.fillStyle = color;
                    ctx.fillRect(0, -r, r, r * 2);
                    ctx.restore();
                }
                trace();
                ctx.stroke();
            }
            ctx.restore();
        });
    }, [worldToScreen]);
    const drawBodies = useCallback((ctx: CanvasRenderingContext2D, camera: Camera, time: number, asteroids: Asteroid[]) => {
        const dark = gameRef.current.settings.theme === "dark";
        const planet = worldToScreen(CENTRAL, camera);
        const pr = CENTRAL.r * camera.zoom;
        const orbitStroke = dark ? "rgba(159,218,211,.42)" : "rgba(48,51,52,.16)";
        const rockStroke = dark ? "rgba(232,242,239,.92)" : "rgba(48,51,52,.8)";
        const vectorStroke = dark ? "rgba(126,231,218,.9)" : "rgba(48,51,52,.58)";
        const rockLabel = dark ? "#e8f2ef" : GRAPHITE;
        ctx.save();
        ctx.strokeStyle = orbitStroke;
        ctx.lineWidth = dark ? 1.35 : 1;
        ctx.setLineDash([4, 7]);
        asteroids.filter((asteroid) => asteroid.alive).forEach((asteroid) => { ctx.beginPath(); ctx.arc(planet.x, planet.y, asteroid.orbitRadius * camera.zoom, 0, Math.PI * 2); ctx.stroke(); });
        ctx.restore();
        ctx.save();
        ctx.fillStyle = "#303538";
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(238,234,224,.7)";
        ctx.lineWidth = 1;
        for (let r = pr * .35; r < pr; r += Math.max(6, pr * .14)) {
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, r, -.85, 2.35);
            ctx.stroke();
        }
        ctx.strokeStyle = dark ? "rgba(174,223,218,.36)" : "rgba(42,47,49,.22)";
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, pr + 85 * camera.zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        asteroids.filter((asteroid) => asteroid.alive).forEach((asteroid, idx) => {
            const pos = asteroidPosition(asteroid, time);
            const p = worldToScreen(pos, camera);
            const r = Math.max(3, asteroid.r * camera.zoom);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(idx * .71 + time * .11 * asteroid.direction);
            ctx.strokeStyle = rockStroke;
            ctx.fillStyle = dark ? "rgba(203,224,219,.24)" : "rgba(108,105,98,.13)";
            ctx.lineWidth = dark ? 2 : 1.6;
            ctx.beginPath();
            for (let i = 0; i < 9; i += 1) {
                const a = i / 9 * Math.PI * 2;
                const rr = r * (.82 + ((i * 13 + idx * 7) % 17) / 100);
                if (i)
                    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
                else
                    ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.closePath();
            if (asteroid.armor >= 2) {
                ctx.fillStyle = dark ? "rgba(210,215,210,.28)" : "rgba(108,105,98,.25)";
                ctx.fill();
            }
            ctx.stroke();
            ctx.strokeStyle = asteroid.armor === 1 ? "#f0a05f" : dark ? "rgba(220,225,220,.34)" : "rgba(48,51,52,.28)";
            ctx.lineWidth = asteroid.armor === 1 ? 2.2 : 1.4;
            ctx.beginPath();
            ctx.moveTo(-r * .62, -r * .24);
            ctx.lineTo(-r * .08, r * .05);
            ctx.lineTo(r * .46, r * .38);
            ctx.stroke();
            ctx.restore();
            const radial = unitVec(sub(pos, CENTRAL));
            const tangent = mul({ x: -radial.y, y: radial.x }, asteroid.direction);
            ctx.save();
            ctx.strokeStyle = vectorStroke;
            ctx.fillStyle = vectorStroke;
            ctx.lineWidth = dark ? 1.7 : 1.2;
            const arrowStart = add(p, mul(tangent, r + 4));
            const arrowEnd = add(arrowStart, mul(tangent, 12));
            const normal = { x: -tangent.y, y: tangent.x };
            ctx.beginPath();
            ctx.moveTo(arrowStart.x, arrowStart.y);
            ctx.lineTo(arrowEnd.x, arrowEnd.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(arrowEnd.x, arrowEnd.y);
            ctx.lineTo(arrowEnd.x - tangent.x * 5 + normal.x * 2.5, arrowEnd.y - tangent.y * 5 + normal.y * 2.5);
            ctx.lineTo(arrowEnd.x - tangent.x * 5 - normal.x * 2.5, arrowEnd.y - tangent.y * 5 - normal.y * 2.5);
            ctx.closePath();
            ctx.fill();
            ctx.font = "700 8px ui-monospace,monospace";
            ctx.fillStyle = rockLabel;
            ctx.fillText(asteroid.id, p.x + r + 5, p.y - r - 3);
            ctx.restore();
        });
    }, [worldToScreen]);
    const drawUnit = useCallback((ctx: CanvasRenderingContext2D, u: Unit, camera: Camera, pos: Vec, heading: number, muted: boolean, storedArmorOverride?: number[]) => {
        if (!isTargetable(u))
            return;
        const dark = gameRef.current.settings.theme === "dark";
        const p = worldToScreen(pos, camera);
        const r = clamp(u.r * camera.zoom, u.kind === "base" ? 10 : 5, u.kind === "base" ? 38 : 17);
        const color = gameRef.current.settings.colors[u.player];
        const field = dark ? "#10171c" : PAPER_2;
        const traceShip = (size: number) => { ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * .72, size * .62); ctx.lineTo(-size * .45, 0); ctx.lineTo(-size * .72, -size * .62); ctx.closePath(); };
        const paintShip = (size: number, armor: number) => {
            traceShip(size);
            ctx.fillStyle = field;
            ctx.fill();
            if (armor >= 3) {
                traceShip(size);
                ctx.fillStyle = color;
                ctx.fill();
            }
            else if (armor === 2) {
                ctx.save();
                traceShip(size);
                ctx.clip();
                ctx.fillStyle = color;
                ctx.fillRect(0, -size, size, size * 2);
                ctx.restore();
            }
            traceShip(size);
            ctx.strokeStyle = color;
            ctx.stroke();
        };
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.globalAlpha = muted ? .45 : 1;
        const liveGame = gameRef.current;
        const unassigned = !muted && liveGame.phase === "ready" && u.player === liveGame.currentPlayer && !actorHasOrder(liveGame, u.id);
        const awaiting = unassigned;
        if (awaiting) {
            ctx.save();
            ctx.strokeStyle = "#ffd24f";
            ctx.lineWidth = 1.6;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(0, 0, r + 14, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        const committed = !muted && (liveGame.phase === "ready" || liveGame.phase === "aiming") && actorHasOrder(liveGame, u.id);
        if (committed) {
            ctx.save();
            ctx.strokeStyle = "#54d77b";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, r + 14, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        if (!muted && liveGame.selectedId === u.id && (liveGame.phase === "ready" || liveGame.phase === "aiming")) {
            ctx.save();
            ctx.strokeStyle = "#ffd24f";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, r + 9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        if (u.kind === "base") {
            ctx.strokeStyle = color;
            ctx.fillStyle = field;
            ctx.lineWidth = 2.3;
            ctx.beginPath();
            for (let i = 0; i < 6; i += 1) {
                const a = -Math.PI / 2 + i * Math.PI / 3;
                const x = Math.cos(a) * r;
                const y = Math.sin(a) * r;
                if (i)
                    ctx.lineTo(x, y);
                else
                    ctx.moveTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            const storedShipArmors = storedArmorOverride ?? gameRef.current.units.filter((ship) => ship.player === u.player && ship.kind === "ship" && ship.alive && !ship.deployed).map((ship) => ship.armor);
            for (let i = 0; i < storedShipArmors.length; i += 1) {
                const slots = gameRef.current.settings.fleetSize;
                const a = -Math.PI / 2 + i * Math.PI * 2 / slots;
                const cx = Math.cos(a) * r * .5;
                const cy = Math.sin(a) * r * .5;
                const size = Math.max(5, r * .25);
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(a + Math.PI);
                ctx.lineWidth = 1.4;
                paintShip(size, storedShipArmors[i]);
                ctx.restore();
            }
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(3, r * .11), 0, Math.PI * 2);
            ctx.fill();
        }
        else {
            ctx.rotate(heading);
            ctx.lineWidth = 2.2;
            paintShip(r, u.armor);
        }
        ctx.restore();
        ctx.save();
        ctx.font = "700 9px ui-monospace,monospace";
        ctx.fillStyle = color;
        ctx.fillText(u.label, p.x + r + 5, p.y - r - 2);
        if (unassigned) {
            ctx.font = "800 8px ui-monospace,monospace";
            ctx.fillStyle = "#ffd24f";
            ctx.fillText(u.kind === "ship" ? "NO ORDER · COAST" : "NO ORDER", p.x + r + 5, p.y - r + 10);
        }
        ctx.restore();
    }, [worldToScreen]);
    const drawPlannedGhosts = useCallback((ctx: CanvasRenderingContext2D, camera: Camera) => {
        const game = gameRef.current;
        const dark = game.settings.theme === "dark";
        const phaseOneByShip = new Map<string, PendingOrder>();
        game.pendingOrders.filter((order) => !order.conditional && order.arrivalPos && (order.action === "THRUST" || order.action === "DEPLOY")).forEach((order) => {
            const shipId = order.action === "DEPLOY" ? order.ghostShipId : order.sourceId;
            if (shipId)
                phaseOneByShip.set(shipId, order);
        });
        const phaseTwoGhosts = game.pendingOrders.filter((order) => order.conditional && order.action === "THRUST" && order.arrivalPos);
        const ghostOrders = [...phaseOneByShip.values(), ...phaseTwoGhosts];
        ghostOrders.forEach((order) => {
            const shipId = order.action === "DEPLOY" ? order.ghostShipId : order.sourceId;
            const ship = game.units.find((unit) => unit.id === shipId && unit.kind === "ship" && unit.alive && (order.action === "DEPLOY" || isTargetable(unit)));
            if (!ship || !order.arrivalPos)
                return;
            const ghostNumber = order.conditional ? 2 : 1;
            const to = worldToScreen(order.arrivalPos, camera);
            const heading = order.arrivalVel ? Math.atan2(order.arrivalVel.y, order.arrivalVel.x) : ship.heading;
            const color = order.arrivalDoomed ? "#d65b4c" : game.settings.colors[order.player];
            const r = clamp(ship.r * camera.zoom, 6, 17);
            const trajectory = order.arrivalPath?.length ? order.arrivalPath : [ship.pos, order.arrivalPos];
            ctx.save();
            ctx.globalAlpha = dark ? .9 : .72;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            trajectory.forEach((point, index) => { const plotted = worldToScreen(point, camera); if (index)
                ctx.lineTo(plotted.x, plotted.y);
            else
                ctx.moveTo(plotted.x, plotted.y); });
            ctx.stroke();
            ctx.translate(to.x, to.y);
            ctx.rotate(heading);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(r, 0);
            ctx.lineTo(-r * .72, r * .62);
            ctx.lineTo(-r * .45, 0);
            ctx.lineTo(-r * .72, -r * .62);
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
            if (order.arrivalDoomed) {
                ctx.beginPath();
                ctx.moveTo(-r, -r);
                ctx.lineTo(r, r);
                ctx.moveTo(r, -r);
                ctx.lineTo(-r, r);
                ctx.stroke();
            }
            ctx.rotate(-heading);
            ctx.font = "800 8px ui-monospace,monospace";
            ctx.fillStyle = color;
            ctx.fillText(order.arrivalDoomed ? `GHOST ${ghostNumber} · IMPACT` : `GHOST ${ghostNumber}`, r + 5, -r - 3);
            ctx.restore();
        });
    }, [worldToScreen]);
    const drawMissile = useCallback((ctx: CanvasRenderingContext2D, m: Missile, camera: Camera, pos: Vec, heading: number) => {
        if (!m.alive)
            return;
        const p = worldToScreen(pos, camera);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(heading);
        ctx.fillStyle = gameRef.current.settings.colors[m.player];
        ctx.fillRect(-5, -2, 10, 4);
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(2, -4);
        ctx.lineTo(2, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }, [worldToScreen]);
    const drawResolutionEffects = useCallback((ctx: CanvasRenderingContext2D, camera: Camera, resolution: Resolution) => {
        resolution.effects.filter((effect) => effect.at <= resolution.progress).forEach(({ event }) => {
            if (event.type === "laser") {
                const a = worldToScreen(event.from, camera);
                const b = worldToScreen(event.to, camera);
                ctx.save();
                const color = gameRef.current.settings.colors[event.player];
                ctx.strokeStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = 7;
                ctx.lineWidth = 3.2;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
                ctx.restore();
                if (event.hit === false) {
                    ctx.save();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
            }
            else if (event.type === "impact") {
                const p = worldToScreen(event.pos, camera);
                const r = event.heavy ? 15 : 10;
                ctx.save();
                ctx.strokeStyle = "#c33f31";
                ctx.lineWidth = 2;
                for (let i = 0; i < 8; i += 1) {
                    const a = i * Math.PI / 4;
                    ctx.beginPath();
                    ctx.moveTo(p.x + Math.cos(a) * 2, p.y + Math.sin(a) * 2);
                    ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
                    ctx.stroke();
                }
                ctx.restore();
            }
            else {
                const p = worldToScreen(event.pos, camera);
                if (event.type === "destroy" && event.base) {
                    const burstProgress = reducedMotion.current ? 1 : clamp((resolution.progress - event.phase!) / .24, 0, 1);
                    drawBaseDestruction(ctx, p, burstProgress, 1, gameRef.current.settings.colors[event.player]);
                    ctx.save();
                    ctx.font = "900 10px ui-monospace,monospace";
                    ctx.fillStyle = "#f08a64";
                    ctx.fillText("BASE CORE DESTROYED", p.x + 52, p.y + 4);
                    ctx.restore();
                }
                else if (event.type === "rock-destroy") {
                    const burstProgress = reducedMotion.current ? 1 : clamp((resolution.progress - event.phase!) / .2, 0, 1);
                    drawBaseDestruction(ctx, p, burstProgress, 1, gameRef.current.settings.colors[event.player], .58, false);
                    ctx.save();
                    ctx.font = "900 9px ui-monospace,monospace";
                    ctx.fillStyle = "#f0a05f";
                    ctx.fillText(`${event.label} SHATTERED`, p.x + 34, p.y + 3);
                    ctx.restore();
                }
                else {
                    const burstProgress = reducedMotion.current ? 1 : clamp((resolution.progress - event.phase!) / .2, 0, 1);
                    drawBaseDestruction(ctx, p, burstProgress, 1, gameRef.current.settings.colors[event.player], .5, false);
                    ctx.save();
                    ctx.font = "800 8px ui-monospace,monospace";
                    ctx.fillStyle = gameRef.current.settings.colors[event.player];
                    ctx.fillText(event.label, p.x + 24, p.y + 3);
                    ctx.restore();
                }
            }
        });
    }, [worldToScreen]);
    const computeTelemetry = useCallback((raw: Vec, pwr: number) => {
        const game = gameRef.current;
        const source = planningSource(game);
        if (!source)
            return;
        if (game.action === "NONE") {
            telemetryRef.current = { speed: `${mag(source.vel).toFixed(1)} u/s`, consequence: "IDLE", periapsis: "—", closest: "—", vector: "No action selected", impact: false };
            return;
        }
        const realSource = commandSource(game);
        const fromGhost = Boolean(realSource && isUnit(realSource) && isUnit(source) && distance(realSource.pos, source.pos) > .01);
        const planningGame = fromGhost ? { ...game, time: game.time + INTERVAL / 2 } : game;
        const preview = previewPath(planningGame, source, game.action, raw, pwr);
        const carriedVelocity = game.action === "DEPLOY" ? { x: 0, y: 0 } : source.vel;
        const resultVel = add(carriedVelocity, preview.applied);
        const followsOrbit = game.action !== "LASER";
        const orbit = game.action === "LASER" || !followsOrbit ? null : orbitalTelemetry(source.pos, resultVel, Boolean(preview.impact));
        let closest = "—";
        if (preview.targetGhost)
            closest = `${Math.round(Math.min(...preview.points.map((p) => distance(p, preview.targetGhost!))))} u`;
        const consequence = game.action === "LASER" ? (preview.impact ? "BLOCKED / HIT" : "CLEAR")
            : preview.impact ? "IMPACT" : orbit!.consequence;
        telemetryRef.current = {
            speed: `${mag(resultVel).toFixed(1)} u/s`,
            consequence,
            periapsis: orbit ? `${Math.round(orbit.periapsis)} u` : "—", closest,
            vector: game.action === "LASER" ? `${Math.round(mag(preview.applied))} u range` : game.action === "TORPEDO" ? `${mag(preview.applied).toFixed(1)} u/s launch` : game.action === "CORRECT" ? `Δv ${mag(preview.applied).toFixed(1)} u/s · one burn` : game.action === "DEPLOY" ? `${mag(preview.applied).toFixed(1)} u/s deployment` : `Δv ${mag(preview.applied).toFixed(1)} u/s`,
            impact: Boolean(preview.impact),
        };
    }, []);
    const drawArrow = useCallback((ctx: CanvasRenderingContext2D, from: Vec, to: Vec, color: string, label: string) => {
        const d = sub(to, from);
        const m = mag(d);
        if (m < 1)
            return;
        const u = mul(d, 1 / m);
        const n = { x: -u.y, y: u.x };
        const head = clamp(m * .13, 7, 12);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - u.x * head + n.x * head * .45, to.y - u.y * head + n.y * head * .45);
        ctx.lineTo(to.x - u.x * head - n.x * head * .45, to.y - u.y * head - n.y * head * .45);
        ctx.closePath();
        ctx.fill();
        ctx.font = "700 10px ui-monospace,monospace";
        ctx.fillText(label, to.x + 6, to.y - 6);
    }, []);
    const drawAim = useCallback((ctx: CanvasRenderingContext2D, camera: Camera) => {
        const game = gameRef.current;
        if (game.phase !== "ready" && game.phase !== "aiming")
            return;
        const source = planningSource(game);
        if (!source || isUnit(source) && !isTargetable(source))
            return;
        const realSource = commandSource(game);
        const fromGhost = Boolean(realSource && isUnit(realSource) && isUnit(source) && distance(realSource.pos, source.pos) > .01);
        const planningGame = fromGhost ? { ...game, time: game.time + INTERVAL / 2 } : game;
        const aim = aimRef.current;
        const preview = previewPath(planningGame, source, game.action, aim.raw, aim.power);
        const origin = worldToScreen(source.pos, camera);
        const applied = actionVector(game.action, aim.raw, aim.power, source);
        const playerColor = game.settings.colors[source.player];
        if (isUnit(source) && source.kind === "ship" && !actorHasOrder(game, source.id)) {
            const coast = predictArrival(game, source);
            ctx.save();
            ctx.strokeStyle = game.settings.theme === "dark" ? "rgba(255,255,255,.55)" : "rgba(45,52,55,.48)";
            ctx.setLineDash([3, 5]);
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            coast.path.forEach((point, index) => { const plotted = worldToScreen(point, camera); if (index)
                ctx.lineTo(plotted.x, plotted.y);
            else
                ctx.moveTo(plotted.x, plotted.y); });
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = "800 8px ui-monospace,monospace";
            ctx.fillStyle = game.settings.theme === "dark" ? "#dce5e3" : "#4f5c61";
            const end = worldToScreen(coast.pos, camera);
            ctx.fillText("COAST", end.x + 6, end.y - 6);
            ctx.restore();
        }
        if (game.action === "NONE")
            return;
        if (game.action === "LASER") {
            drawArrow(ctx, origin, worldToScreen(add(source.pos, applied), camera), playerColor, "RANGE");
            if (isUnit(source)) {
                const halfAngle = (source.kind === "base" ? 1 : 2) * Math.PI / 180;
                ctx.save();
                ctx.strokeStyle = playerColor;
                ctx.globalAlpha = .48;
                ctx.setLineDash([5, 5]);
                [halfAngle, -halfAngle].forEach((angle) => { const edge = worldToScreen(add(source.pos, rotateVec(applied, angle)), camera); ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(edge.x, edge.y); ctx.stroke(); });
                ctx.restore();
            }
        }
        else {
            drawArrow(ctx, origin, worldToScreen(add(source.pos, mul(source.vel, 7)), camera), "#536a73", "V");
            const scale = game.action === "TORPEDO" ? 4.2 : 8;
            const vectorLabel = game.action === "THRUST" ? "ΔV" : game.action === "CORRECT" ? "BURN" : game.action === "DEPLOY" ? "DEPLOY" : "LAUNCH";
            drawArrow(ctx, origin, worldToScreen(add(source.pos, mul(applied, scale)), camera), playerColor, vectorLabel);
            if (game.action === "CORRECT" || game.action === "THRUST")
                drawArrow(ctx, origin, worldToScreen(add(source.pos, mul(add(source.vel, applied), 7)), camera), "#7a4f91", "V′");
        }
        ctx.save();
        preview.points.forEach((p, i) => {
            if (!i)
                return;
            const s = worldToScreen(p, camera);
            const faded = i > preview.strongCount;
            ctx.globalAlpha = faded ? clamp(.5 - (i - preview.strongCount) / Math.max(1, preview.points.length - preview.strongCount) * .38, .1, .5) : .8;
            ctx.fillStyle = preview.impact && i === preview.points.length - 1 ? "#bd3c31" : playerColor;
            ctx.beginPath();
            ctx.arc(s.x, s.y, game.action === "LASER" ? 1.4 : 1.75, 0, Math.PI * 2);
            ctx.fill();
        });
        if (preview.impact) {
            const p = worldToScreen(preview.impact, camera);
            const size = 11;
            const gap = 3.5;
            ctx.globalAlpha = 1;
            ctx.lineCap = "round";
            const mark = () => { ctx.beginPath(); [[-size, -size, -gap, -gap], [gap, gap, size, size], [size, -size, gap, -gap], [-gap, gap, -size, size]].forEach(([x1, y1, x2, y2]) => { ctx.moveTo(p.x + x1, p.y + y1); ctx.lineTo(p.x + x2, p.y + y2); }); ctx.stroke(); };
            ctx.strokeStyle = game.settings.theme === "dark" ? "#10171c" : "#343638";
            ctx.lineWidth = 5;
            mark();
            ctx.strokeStyle = "#ffd24f";
            ctx.lineWidth = 2.5;
            mark();
            ctx.font = "900 9px ui-monospace,monospace";
            ctx.fillStyle = game.settings.theme === "dark" ? "#ffe17e" : "#7a5a00";
            ctx.fillText("IMPACT", p.x + 15, p.y - 13);
        }
        ctx.restore();
        const controlRadius = vectorControlRadius();
        const direction = unitVec(aim.raw);
        const handle = add(origin, mul(direction, Math.max(12, aim.power * controlRadius)));
        ctx.save();
        ctx.strokeStyle = "rgba(38,49,54,.34)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, controlRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(38,49,54,.74)";
        ctx.lineWidth = game.phase === "aiming" ? 2.4 : 1.5;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(handle.x, handle.y);
        ctx.stroke();
        ctx.translate(handle.x, handle.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = playerColor;
        ctx.strokeStyle = "#202a2e";
        ctx.lineWidth = 2.5;
        const handleSize = game.phase === "aiming" ? 12 : 10;
        ctx.beginPath();
        ctx.rect(-handleSize, -handleSize, handleSize * 2, handleSize * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        if (game.phase === "aiming") {
            ctx.save();
            ctx.fillStyle = "rgba(238,234,224,.92)";
            ctx.strokeStyle = "rgba(38,49,54,.55)";
            ctx.lineWidth = 1;
            const label = "RELEASE SETS VECTOR";
            ctx.font = "800 9px ui-monospace,monospace";
            const width = ctx.measureText(label).width + 14;
            const x = origin.x - width / 2;
            const y = origin.y - controlRadius - 25;
            ctx.fillRect(x, y, width, 19);
            ctx.strokeRect(x, y, width, 19);
            ctx.fillStyle = GRAPHITE;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, origin.x, y + 10);
            ctx.restore();
        }
    }, [drawArrow, vectorControlRadius, worldToScreen]);
    const drawIndicators = useCallback((ctx: CanvasRenderingContext2D, camera: Camera) => {
        const { width, height } = canvasSize.current;
        const objects = [
            ...gameRef.current.units.filter(isTargetable).map((u) => ({ pos: animatedPosition(u.id, u.pos), player: u.player })),
            ...gameRef.current.missiles.filter((m) => m.alive).map((m) => ({ pos: animatedPosition(m.id, m.pos), player: m.player })),
        ];
        objects.forEach((o) => {
            const p = worldToScreen(o.pos, camera);
            if (p.x > 16 && p.x < width - 16 && p.y > 16 && p.y < height - 16)
                return;
            const center = { x: width / 2, y: height / 2 };
            const d = sub(p, center);
            const s = Math.min((width / 2 - 18) / Math.max(1, Math.abs(d.x)), (height / 2 - 18) / Math.max(1, Math.abs(d.y)));
            const q = add(center, mul(d, s));
            ctx.save();
            ctx.translate(q.x, q.y);
            ctx.rotate(Math.atan2(d.y, d.x));
            ctx.fillStyle = gameRef.current.settings.colors[o.player];
            ctx.beginPath();
            ctx.moveTo(8, 0);
            ctx.lineTo(-5, -5);
            ctx.lineTo(-5, 5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });
    }, [animatedPosition, worldToScreen]);
    const drawMinimap = useCallback((ctx: CanvasRenderingContext2D, camera: Camera, time: number, asteroids: Asteroid[]) => {
        const dark = gameRef.current.settings.theme === "dark";
        const { width, height } = canvasSize.current;
        const w = clamp(width * .18, 92, 170);
        const h = w * 2 / 3;
        const x = width - w - 12;
        const y = 12;
        ctx.save();
        ctx.fillStyle = dark ? "rgba(7,13,17,.92)" : "rgba(238,234,224,.9)";
        ctx.strokeStyle = dark ? "rgba(189,218,214,.62)" : "rgba(42,52,56,.55)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        const map = (p: Vec): Vec => ({ x: x + p.x / WORLD_W * w, y: y + p.y / WORLD_H * h });
        const c = map(CENTRAL);
        ctx.fillStyle = dark ? "#69787b" : "#4a4d4d";
        ctx.beginPath();
        ctx.arc(c.x, c.y, CENTRAL.r / WORLD_W * w, 0, Math.PI * 2);
        ctx.fill();
        asteroids.filter((asteroid) => asteroid.alive).forEach((asteroid) => { const p = map(asteroidPosition(asteroid, time)); ctx.strokeStyle = dark ? "#d8e6e2" : "#77766f"; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, asteroid.r / WORLD_W * w), 0, Math.PI * 2); ctx.stroke(); });
        gameRef.current.units.filter(isTargetable).forEach((u) => { const p = map(animatedPosition(u.id, u.pos)); ctx.fillStyle = gameRef.current.settings.colors[u.player]; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); });
        gameRef.current.missiles.filter((m) => m.alive).forEach((m) => { const p = map(animatedPosition(m.id, m.pos)); ctx.fillStyle = gameRef.current.settings.colors[m.player]; ctx.fillRect(p.x - 1, p.y - 1, 2, 2); });
        const vw = width / camera.zoom / WORLD_W * w;
        const vh = height / camera.zoom / WORLD_H * h;
        const cp = map(camera);
        ctx.strokeStyle = dark ? "#f1f6f5" : "#151c20";
        ctx.strokeRect(cp.x - vw / 2, cp.y - vh / 2, vw, vh);
        ctx.restore();
    }, [animatedPosition]);
    const renderScene = useCallback((ctx: CanvasRenderingContext2D, camera: Camera, mode: ViewMode, interactive: boolean) => {
        const replay = interactive && replayRef.current.active;
        const resolution = interactive ? resolutionRef.current : null;
        const motionProgress = resolution ? resolutionMotionProgress(resolution) : 1;
        const maxHistoryTurn = Math.max(1, ...gameRef.current.history.map((event) => event.turn));
        const sceneTime = replay ? replayRef.current.progress * maxHistoryTurn * INTERVAL : resolution ? lerp(gameRef.current.time, resolution.game.time, motionProgress) : gameRef.current.time;
        const isDead = (kind: TimedDeath["kind"], id: string) => Boolean(resolution?.deaths.some((death) => death.kind === kind && death.id === id && death.at <= resolution.progress));
        const isBorn = (kind: TimedBirth["kind"], id: string) => !resolution || !resolution.births.some((birth) => birth.kind === kind && birth.id === id) || resolution.births.some((birth) => birth.kind === kind && birth.id === id && birth.at <= resolution.progress);
        const visualArmor = (unit: Unit) => resolution?.damage.filter((hit) => hit.id === unit.id && hit.at <= resolution.progress).at(-1)?.armor ?? gameRef.current.units.find((original) => original.id === unit.id)?.armor ?? unit.armor;
        const replayTurn = replay ? replayRef.current.progress * maxHistoryTurn : Infinity;
        const visualAsteroids = (replay ? ASTEROID_SEEDS : gameRef.current.asteroids).map((asteroid) => { const replayArmor = replay ? gameRef.current.history.filter((event): event is DamageEvent => event.type === "damage" && event.id === asteroid.id && event.turn - 1 + (event.phase ?? 0) <= replayTurn).at(-1)?.armor : undefined; return { ...asteroid, armor: replayArmor ?? resolution?.damage.filter((hit) => hit.id === asteroid.id && hit.at <= resolution.progress).at(-1)?.armor ?? asteroid.armor, alive: asteroid.alive && !isDead("asteroid", asteroid.id) && !gameRef.current.history.some((event) => event.type === "rock-destroy" && event.label === asteroid.id && event.turn - 1 + (event.phase ?? 0) <= replayTurn) }; });
        drawGrid(ctx, camera);
        drawHistory(ctx, camera, mode);
        drawBodies(ctx, camera, sceneTime, visualAsteroids);
        if (replay) {
            const initial = createGame(gameRef.current.settings, "ready");
            initial.units.filter((unit) => unit.kind === "base" && !gameRef.current.history.some((event) => event.type === "destroy" && event.label === unit.label && event.turn <= replayTurn)).forEach((base) => {
                const status = gameRef.current.history.filter((event): event is BaseStatusEvent => event.type === "base-status" && event.player === base.player && event.turn <= replayTurn).at(-1);
                const initialArmors = initial.units.filter((ship) => ship.player === base.player && ship.kind === "ship").map((ship) => ship.armor);
                drawUnit(ctx, { ...base, armor: status?.baseArmor ?? base.armor }, camera, base.pos, base.heading, false, status?.shipArmors ?? initialArmors);
            });
            drawReplayMarkers(ctx, camera);
            return;
        }
        if (resolution)
            resolution.tracks.forEach((points, id) => {
                const sample = points.slice(0, Math.max(2, Math.ceil(points.length * motionProgress)));
                if (sample.length < 2)
                    return;
                const missile = resolution.game.missiles.find((m) => m.id === id);
                const unit = resolution.game.units.find((u) => u.id === id);
                const player = missile?.player ?? unit?.player;
                ctx.save();
                ctx.strokeStyle = player === undefined ? (gameRef.current.settings.theme === "dark" ? "rgba(210,220,218,.72)" : "rgba(47,51,52,.72)") : `rgba(${hexRgb(gameRef.current.settings.colors[player])},${missile ? .9 : .62})`;
                ctx.lineWidth = missile ? 1.4 : 1.2;
                if (missile)
                    ctx.setLineDash([6, 6]);
                ctx.beginPath();
                sample.forEach((p, i) => { const s = worldToScreen(p, camera); if (i)
                    ctx.lineTo(s.x, s.y);
                else
                    ctx.moveTo(s.x, s.y); });
                ctx.stroke();
                ctx.restore();
            });
        const units = resolution ? resolution.game.units : gameRef.current.units;
        units.forEach((u) => { const original = gameRef.current.units.find((unit) => unit.id === u.id); const visible = resolution ? !isDead("unit", u.id) && (isTargetable(u) || Boolean(original && isTargetable(original))) : isTargetable(u); if (visible)
            drawUnit(ctx, { ...u, alive: true, armor: visualArmor(u) }, camera, interactive ? animatedPosition(u.id, u.pos) : u.pos, interactive ? animatedHeading(u.id, u.heading) : u.heading, mode === "history"); });
        if (interactive && !resolution)
            drawPlannedGhosts(ctx, camera);
        const missiles = resolution ? resolution.game.missiles : gameRef.current.missiles;
        missiles.forEach((m) => { const original = gameRef.current.missiles.find((missile) => missile.id === m.id); const visible = resolution ? isBorn("torpedo", m.id) && !isDead("torpedo", m.id) && (m.alive || Boolean(original?.alive)) : m.alive; if (visible)
            drawMissile(ctx, { ...m, alive: true }, camera, interactive ? animatedPosition(m.id, m.pos) : m.pos, interactive ? animatedHeading(m.id, Math.atan2(m.vel.y, m.vel.x)) : Math.atan2(m.vel.y, m.vel.x)); });
        if (resolution)
            drawResolutionEffects(ctx, camera, resolution);
        if (interactive) {
            drawAim(ctx, camera);
            drawIndicators(ctx, camera);
            drawMinimap(ctx, camera, sceneTime, visualAsteroids);
        }
    }, [animatedHeading, animatedPosition, drawAim, drawBodies, drawGrid, drawHistory, drawIndicators, drawMinimap, drawMissile, drawPlannedGhosts, drawReplayMarkers, drawResolutionEffects, drawUnit, worldToScreen]);
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx)
            return;
        const { width, height, dpr } = canvasSize.current;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        const camera = cameraRef.current;
        renderScene(ctx, camera, gameRef.current.phase === "gameover" || replayRef.current.active ? "history" : viewMode, true);
    }, [renderScene, viewMode]);
    const moveCameraTo = useCallback((target: Camera, smooth = true) => {
        cancelAnimationFrame(cameraRafRef.current);
        const destination = { ...target };
        clampCamera(destination);
        const start = { ...cameraRef.current };
        const changed = Math.abs(start.x - destination.x) + Math.abs(start.y - destination.y) + Math.abs(start.zoom - destination.zoom) * 100 > .5;
        if (!smooth || reducedMotion.current || !changed) {
            cameraRef.current = destination;
            draw();
            return;
        }
        const started = performance.now();
        const duration = 800;
        const animateCamera = (now: number) => {
            const progress = clamp((now - started) / duration, 0, 1);
            const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
            cameraRef.current = { x: lerp(start.x, destination.x, eased), y: lerp(start.y, destination.y, eased), zoom: lerp(start.zoom, destination.zoom, eased) };
            draw();
            if (progress < 1)
                cameraRafRef.current = requestAnimationFrame(animateCamera);
            else
                cameraRef.current = destination;
        };
        cameraRafRef.current = requestAnimationFrame(animateCamera);
    }, [clampCamera, draw]);
    const resize = useCallback(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap)
            return;
        const rect = wrap.getBoundingClientRect();
        const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        canvasSize.current = { width: rect.width, height: rect.height, dpr };
        clampCamera(cameraRef.current);
        draw();
    }, [clampCamera, draw]);
    useEffect(() => {
        reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const canvas = canvasRef.current;
        const preventBrowserGesture = (event: Event) => { if (event.cancelable)
            event.preventDefault(); };
        canvas?.addEventListener("touchstart", preventBrowserGesture, { passive: false });
        canvas?.addEventListener("touchmove", preventBrowserGesture, { passive: false });
        canvas?.addEventListener("gesturestart", preventBrowserGesture, { passive: false });
        canvas?.addEventListener("gesturechange", preventBrowserGesture, { passive: false });
        const observer = new ResizeObserver(resize);
        if (wrapRef.current)
            observer.observe(wrapRef.current);
        resize();
        return () => {
            canvas?.removeEventListener("touchstart", preventBrowserGesture);
            canvas?.removeEventListener("touchmove", preventBrowserGesture);
            canvas?.removeEventListener("gesturestart", preventBrowserGesture);
            canvas?.removeEventListener("gesturechange", preventBrowserGesture);
            observer.disconnect();
            cancelAnimationFrame(rafRef.current);
            cancelAnimationFrame(cameraRafRef.current);
            window.clearTimeout(resolutionTimeoutRef.current);
            window.clearTimeout(cpuTimerRef.current);
            window.clearTimeout(cpuCommitTimerRef.current);
        };
    }, [resize]);
    useEffect(() => { aimRef.current.power = power; computeTelemetry(aimRef.current.raw, power); bump(); draw(); }, [power, viewMode, bump, computeTelemetry, draw]);
    useEffect(() => {
        const root = document.documentElement;
        const previous = root.style.fontSize;
        root.style.fontSize = `${16 * UI_SCALE_VALUES[uiScale]}px`;
        return () => { root.style.fontSize = previous; };
    }, [uiScale]);
    const setPlottedVector = useCallback((angle: number, nextPower: number, announcement?: string) => {
        const plottedPower = clamp(nextPower, .06, 1);
        const aim = aimRef.current;
        aim.raw = mul({ x: Math.cos(angle), y: Math.sin(angle) }, plottedPower * MAX_VECTOR_INPUT);
        aim.power = plottedPower;
        aim.keyboard = true;
        setPower(plottedPower);
        computeTelemetry(aim.raw, plottedPower);
        if (announcement)
            setLiveMessage(announcement);
        bump();
        draw();
    }, [bump, computeTelemetry, draw]);
    const setSelected = useCallback((id: string) => {
        const game = gameRef.current;
        if (game.phase !== "ready" || isCpuTurn(game))
            return;
        const u = game.units.find((x) => x.id === id && x.player === game.currentPlayer && isTargetable(x));
        if (!u)
            return;
        game.selectedId = id;
        if (!actorHasOrder(game, u.id))
            game.action = u.kind === "base" ? "LASER" : "THRUST";
        else if (actionDisabledReason(game, u, game.action))
            game.action = preferredAction(game, u) ?? game.action;
        const defaultDirection = u.kind === "ship" && mag(u.vel) > .01 ? unitVec(u.vel) : { x: u.player === 0 ? 1 : -1, y: 0 };
        aimRef.current.raw = mul(defaultDirection, aimRef.current.power * MAX_VECTOR_INPUT);
        aimRef.current.keyboard = true;
        computeTelemetry(aimRef.current.raw, aimRef.current.power);
        setLiveMessage(`${u.label} selected.`);
        bump();
        draw();
    }, [bump, computeTelemetry, draw]);
    const setAction = useCallback((action: ActionKind) => {
        const game = gameRef.current;
        const source = commandSource(game);
        if (!source || game.phase !== "ready" || isCpuTurn(game))
            return;
        if (actionDisabledReason(game, source, action))
            return;
        game.action = action;
        aimRef.current.keyboard = true;
        computeTelemetry(aimRef.current.raw, aimRef.current.power);
        setLiveMessage(action === "NONE" ? `${actionLabel(action, source)} selected. Commit it to use this asset’s action without thrust or fire.` : `${action} declared. Plot its vector, review the trace, then commit.`);
        bump();
        draw();
    }, [bump, computeTelemetry, draw]);
    const finishResolution = useCallback((resolution: Resolution) => {
        window.clearTimeout(resolutionTimeoutRef.current);
        const next = resolution.game;
        resolution.tracks.forEach((points, id) => {
            if (points.length < 2)
                return;
            const missile = next.missiles.find((m) => m.id === id);
            const unit = next.units.find((u) => u.id === id);
            const player = missile?.player ?? unit?.player;
            if (player !== undefined)
                next.history.push({ type: "path", objectKind: missile ? "torpedo" : "ship", objectId: id, player, turn: next.turn, points });
        });
        ([0, 1] as const).forEach((player) => {
            const base = next.units.find((unit) => unit.player === player && unit.kind === "base");
            if (!base)
                return;
            next.history.push({ type: "base-status", player, turn: next.turn, pos: cloneVec(base.pos), baseArmor: base.armor, shipArmors: next.units.filter((ship) => ship.player === player && ship.kind === "ship" && ship.alive && !ship.deployed).map((ship) => ship.armor) });
        });
        const outcome = findOutcome(next);
        next.winner = outcome.winner;
        next.draw = outcome.draw;
        if (next.winner !== null || next.draw) {
            const drawMessage = "No controllable assets remain on either side. The battle ends in a draw.";
            next.pendingOrders = [];
            next.phase = "gameover";
            next.log.unshift(next.draw ? drawMessage : `COMMANDER ${next.winner! + 1} wins the battle.`);
            setLiveMessage(next.draw ? drawMessage : `Commander ${next.winner! + 1} wins. Complete battle history shown.`);
            setViewMode("history");
            moveCameraTo({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: fitZoom() });
        }
        else {
            next.turn += 1;
            next.initiative = (1 - next.initiative) as 0 | 1;
            next.actionInRound = 0;
            next.currentPlayer = next.initiative;
            next.pendingOrders = [];
            next.planningComplete = [false, false];
            next.phase = "ready";
            next.units.filter((u) => u.laserCooldown > 0).forEach((u) => { u.laserCooldown = Math.max(0, u.laserCooldown - 1); });
            const chosen = preferredUnit(next, next.currentPlayer);
            if (chosen) {
                next.selectedId = chosen.id;
                next.action = preferredAction(next, chosen) ?? next.action;
            }
            if (chosen)
                next.action = preferredAction(next, chosen) ?? next.action;
            const assets = planningActors(next, next.currentPlayer).length;
            next.log.unshift(`ROUND ${next.turn}: COMMANDER ${next.currentPlayer + 1} plots first for ${assets} assets.`);
            setLiveMessage(`Round ${next.turn}. Commander ${next.currentPlayer + 1} assigns up to one action to each asset. Unassigned ships coast.`);
            const direction = chosen?.kind === "ship" && mag(chosen.vel) > .01 ? unitVec(chosen.vel) : { x: next.currentPlayer === 0 ? 1 : -1, y: 0 };
            aimRef.current.raw = mul(direction, aimRef.current.power * MAX_VECTOR_INPUT);
        }
        gameRef.current = next;
        resolutionRef.current = null;
        aimRef.current.pointerId = null;
        aimRef.current.keyboard = true;
        if (next.phase === "ready")
            moveCameraTo(commanderCamera(next, next.currentPlayer));
        computeTelemetry(aimRef.current.raw, aimRef.current.power);
        bump();
        draw();
    }, [bump, commanderCamera, computeTelemetry, draw, fitZoom, moveCameraTo]);
    const simulateAction = useCallback((raw: Vec, pwr: number, finishPlanning = false) => {
        const sourceGame = gameRef.current;
        if (sourceGame.phase !== "ready")
            return;
        const working = cloneGame(sourceGame);
        const source = commandSource(working);
        if (!source || isUnit(source) && !isTargetable(source))
            return;
        const plottedSource = planningSource(working) ?? source;
        const events: HistoryEvent[] = [];
        const effects: TimedEffect[] = [];
        const deaths: TimedDeath[] = [];
        const damage: TimedDamage[] = [];
        const births: TimedBirth[] = [];
        const addEffect = (event: TimedEffect["event"], at: number) => { const timed = { ...event, phase: at } as TimedEffect["event"]; events.push(timed); effects.push({ event: timed, at }); };
        const destroyAt = (id: string, kind: TimedDeath["kind"], at: number) => { if (!deaths.some((death) => death.id === id && death.kind === kind))
            deaths.push({ id, kind, at }); };
        const damageTarget = (target: Unit, attacker: 0 | 1, pos: Vec, amount: number, label: string, at: number) => {
            const eventStart = events.length;
            const killed = applyDamage(working, target, attacker, events, pos, amount, label);
            events.slice(eventStart).forEach((event) => { if (event.type === "impact" || event.type === "destroy" || event.type === "rock-destroy") {
                event.phase = at;
                effects.push({ event, at });
            } });
            events.push({ type: "damage", player: target.player, turn: working.turn, pos: cloneVec(target.pos), id: target.id, armor: target.armor, objectKind: target.kind, phase: at });
            damage.push({ id: target.id, armor: target.armor, at });
            if (killed)
                destroyAt(target.id, "unit", at);
            return killed;
        };
        const damageRock = (id: string, attacker: 0 | 1, pos: Vec, label: string, at: number) => {
            const rock = working.asteroids.find((asteroid) => asteroid.id === id && asteroid.alive);
            if (!rock)
                return;
            rock.armor = Math.max(0, rock.armor - 1);
            addEffect({ type: "impact", player: attacker, turn: working.turn, pos: cloneVec(pos) }, at);
            events.push({ type: "damage", player: attacker, turn: working.turn, pos: cloneVec(pos), id: rock.id, armor: rock.armor, objectKind: "asteroid", phase: at });
            damage.push({ id: rock.id, armor: rock.armor, at });
            if (rock.armor > 0)
                working.log.unshift(`${rock.id} took 1 HP from ${label}; ${rock.armor} HP remains.`);
            else {
                rock.alive = false;
                addEffect({ type: "rock-destroy", player: attacker, turn: working.turn, pos: cloneVec(pos), label: rock.id }, at);
                destroyAt(rock.id, "asteroid", at);
                working.log.unshift(`${rock.id} destroyed by ${label}.`);
            }
        };
        if (!finishPlanning) {
            const actor = actorForSource(working, source);
            if (!actor || actor.player !== working.currentPlayer || actorHasOrder(working, actor.id))
                return;
            const applied = actionVector(working.action, raw, pwr, plottedSource);
            if (working.action !== "NONE" && mag(applied) < .5) {
                setLiveMessage("Increase vector power before committing.");
                bump();
                return;
            }
            let arrival: ReturnType<typeof predictArrival> | null = null;
            let ghostShipId: string | undefined;
            if (working.action === "THRUST" && isUnit(source) && source.kind === "ship") {
                const previewShip = { ...source, vel: add(source.vel, applied) };
                arrival = predictArrival(working, previewShip);
                ghostShipId = source.id;
            }
            else if (working.action === "DEPLOY" && isUnit(source) && source.kind === "base") {
                const reserve = healthiestReserveFor(working, source.player);
                if (!reserve)
                    return;
                const dir = unitVec(applied);
                const previewShip = { ...reserve, deployed: true, pos: add(source.pos, mul(dir, source.r + reserve.r + 8)), vel: cloneVec(applied) };
                arrival = predictArrival(working, previewShip);
                ghostShipId = reserve.id;
            }
            working.pendingOrders.push({ player: source.player, sourceId: source.id, actorId: actor.id, action: working.action, vector: cloneVec(applied), markerPos: cloneVec(plottedSource.pos), ghostShipId, arrivalPos: arrival ? cloneVec(arrival.pos) : undefined, arrivalVel: arrival ? cloneVec(arrival.vel) : undefined, arrivalPath: arrival?.path.map(cloneVec), arrivalDoomed: arrival?.doomed });
            working.log.unshift(`${actor.label} committed ${actionLabel(working.action, source)}.`);
        }
        const player = working.currentPlayer;
        const unordered = planningActors(working, player).filter((actor) => !actorHasOrder(working, actor.id));
        if (finishPlanning || unordered.length === 0)
            working.planningComplete[player] = true;
        if (!working.planningComplete[player]) {
            const chosen = unordered[0];
            if (chosen) {
                working.selectedId = chosen.id;
                working.action = preferredAction(working, chosen) ?? working.action;
            }
            working.actionInRound = working.pendingOrders.length;
            gameRef.current = working;
            aimRef.current.pointerId = null;
            aimRef.current.keyboard = true;
            setLiveMessage(`${sourceLabel(source)} order committed. ${unordered.length} asset${unordered.length === 1 ? "" : "s"} remain without orders; they may coast.`);
            computeTelemetry(aimRef.current.raw, aimRef.current.power);
            bump();
            draw();
            return;
        }
        const other = (1 - player) as 0 | 1;
        if (!working.planningComplete[other]) {
            working.currentPlayer = other;
            const chosen = preferredUnit(working, other);
            if (chosen) {
                working.selectedId = chosen.id;
                working.action = preferredAction(working, chosen) ?? working.action;
            }
            working.actionInRound = working.pendingOrders.length;
            gameRef.current = working;
            aimRef.current.pointerId = null;
            aimRef.current.keyboard = true;
            moveCameraTo(commanderCamera(working, other));
            const direction = chosen?.kind === "ship" && mag(chosen.vel) > .01 ? unitVec(chosen.vel) : { x: other === 0 ? 1 : -1, y: 0 };
            aimRef.current.raw = mul(direction, aimRef.current.power * MAX_VECTOR_INPUT);
            setLiveMessage(`Commander ${player + 1} planning complete. Commander ${other + 1}, assign one action per asset or leave ships coasting.`);
            computeTelemetry(aimRef.current.raw, aimRef.current.power);
            bump();
            draw();
            return;
        }
        // Materialize all committed non-laser orders at t=0. Lasers then resolve
        // sequentially before the shared six-second motion interval begins.
        working.pendingOrders.filter((order) => order.action !== "LASER" && order.action !== "NONE").forEach((order) => {
            if (order.action === "CORRECT") {
                const torpedo = working.missiles.find((missile) => missile.id === order.sourceId && missile.alive && missile.correctionAvailable);
                const commander = working.units.find((unit) => unit.id === order.actorId && isTargetable(unit));
                if (!torpedo || !commander) {
                    working.log.unshift(`${order.sourceId.toUpperCase()} correction cancelled; its launching ship is gone.`);
                    return;
                }
                torpedo.vel = add(torpedo.vel, order.vector);
                torpedo.correctionAvailable = false;
                working.log.unshift(`${commander.label} corrected ${sourceLabel(torpedo)}.`);
                return;
            }
            const unit = working.units.find((candidate) => candidate.id === order.sourceId && isTargetable(candidate));
            if (!unit)
                return;
            if (order.action === "DEPLOY" && unit.kind === "base") {
                const reserve = healthiestReserveFor(working, unit.player);
                if (!reserve)
                    return;
                const dir = unitVec(order.vector);
                const deployedHp = reserve.armor;
                reserve.deployed = true;
                reserve.pos = add(unit.pos, mul(dir, unit.r + reserve.r + 8));
                reserve.vel = cloneVec(order.vector);
                reserve.heading = Math.atan2(order.vector.y, order.vector.x);
                unit.armor = Math.max(1, unit.armor - deployedHp);
                damage.push({ id: unit.id, armor: unit.armor, at: 0 });
                working.log.unshift(`${reserve.label} deployed from ${unit.label}. Base HP is now ${unit.armor}.`);
            }
            else if (order.action === "THRUST" && unit.kind === "ship") {
                unit.vel = add(unit.vel, order.vector);
                unit.heading = Math.atan2(unit.vel.y, unit.vel.x);
                working.log.unshift(`${unit.label} applied Δv ${mag(order.vector).toFixed(1)}.`);
            }
            else if (order.action === "TORPEDO" && unit.kind === "ship" && unit.missiles > 0) {
                unit.missiles -= 1;
                const dir = unitVec(order.vector);
                const torpedo: Missile = { id: `t${working.nextMissileId++}`, player: unit.player, sourceId: unit.id, pos: add(unit.pos, mul(dir, unit.r + 15)), vel: add(unit.vel, order.vector), r: 9, alive: true, age: 0, correctionAvailable: false };
                working.missiles.push(torpedo);
                births.push({ at: 0, id: torpedo.id, kind: "torpedo" });
                working.log.unshift(`${unit.label} launched ${sourceLabel(torpedo)}.`);
            }
        });
        working.phase = "resolving";
        working.pendingOrders.filter((order) => order.action !== "NONE").forEach((order) => events.push({ type: "marker", player: order.player, turn: working.turn, pos: cloneVec(order.markerPos), label: order.action }));
        const hasLaser = working.pendingOrders.some((order) => order.action === "LASER");
        const lead = hasLaser ? .3 : 0;
        const timelineAt = (physicsProgress: number) => lead + clamp(physicsProgress, 0, 1) * (1 - lead);
        const laserQueues = ([working.initiative, (1 - working.initiative) as 0 | 1] as const).map((player) => working.pendingOrders.filter((order) => order.action === "LASER" && order.player === player));
        const lasers: PendingOrder[] = [];
        for (let i = 0; i < Math.max(laserQueues[0].length, laserQueues[1].length); i += 1)
            laserQueues.forEach((queue) => { if (queue[i])
                lasers.push(queue[i]); });
        lasers.forEach((order, index) => {
            const laserSource = working.units.find((unit) => unit.id === order.sourceId && isTargetable(unit));
            if (!laserSource)
                return;
            const from = cloneVec(laserSource.pos);
            const shotVector = laserVector(working, order, laserSource);
            const proposed = add(from, shotVector);
            const hit = lineTarget(working, from, proposed, laserSource);
            const to = hit?.point ?? proposed;
            const shotAt = Math.min(.24, index * .055);
            addEffect({ type: "laser", player: order.player, turn: working.turn, from, to: cloneVec(to), hit: Boolean(hit) }, shotAt);
            if (hit?.type === "unit") {
                const target = working.units.find((unit) => unit.id === hit.id);
                if (target)
                    damageTarget(target, order.player, hit.point, 1, "laser", shotAt + .035);
            }
            else if (hit?.type === "torpedo") {
                const target = working.missiles.find((missile) => missile.id === hit.id);
                if (target) {
                    target.alive = false;
                    addEffect({ type: "impact", player: order.player, turn: working.turn, pos: cloneVec(hit.point) }, shotAt + .035);
                    destroyAt(target.id, "torpedo", shotAt + .035);
                    working.log.unshift(`${laserSource.label} intercepted ${sourceLabel(target)}.`);
                }
            }
            else if (hit?.type === "solid") {
                if (hit.id === "planet")
                    working.log.unshift(`${laserSource.label}'s laser was blocked by the planet.`);
                else
                    damageRock(hit.id, order.player, hit.point, "laser", shotAt + .035);
            }
            else
                working.log.unshift(`${laserSource.label} fired laser and missed.`);
        });
        const tracks = new Map<string, Vec[]>();
        const shipMovesThisTurn = (u: Unit) => u.kind === "ship" && u.alive && u.deployed;
        working.units.filter(shipMovesThisTurn).forEach((u) => tracks.set(u.id, [cloneVec(u.pos)]));
        working.missiles.filter((m) => m.alive).forEach((m) => tracks.set(m.id, [cloneVec(m.pos)]));
        const asteroidHits = new Set<string>();
        const laserOutcome = findOutcome(working);
        for (let step = 0; step < STEPS && laserOutcome.winner === null && !laserOutcome.draw; step += 1) {
            const previousTime = working.time;
            const unitStarts = new Map(working.units.filter(isTargetable).map((u) => [u.id, cloneVec(u.pos)]));
            working.time += STEP;
            const movers: (Unit | Missile)[] = [...working.units.filter(shipMovesThisTurn), ...working.missiles.filter((m) => m.alive)];
            movers.forEach((mover) => {
                if (!mover.alive)
                    return;
                const old = cloneVec(mover.pos);
                const next = verlet(mover.pos, mover.vel, STEP, working.settings.gravity);
                mover.pos = next.pos;
                mover.vel = next.vel;
                if ("age" in mover)
                    mover.age += STEP;
                else if (mover.kind === "ship" && distance(old, mover.pos) > .001)
                    mover.heading = Math.atan2(mover.pos.y - old.y, mover.pos.x - old.x);
                const at = timelineAt((step + 1) / STEPS);
                const collision = solidCollision(working, old, mover.pos, mover.r, previousTime, working.time);
                if (collision) {
                    mover.pos = collision.point;
                    mover.alive = false;
                    addEffect({ type: "impact", player: mover.player, turn: working.turn, pos: cloneVec(collision.point), heavy: "kind" in mover }, at);
                    if ("kind" in mover) {
                        mover.armor = 0;
                        addEffect({ type: "destroy", player: mover.player, turn: working.turn, pos: cloneVec(collision.point), label: mover.label }, at);
                        destroyAt(mover.id, "unit", at);
                        working.log.unshift(`${mover.label} struck a massive body.`);
                        const asteroid = working.asteroids.find((rock) => rock.id === collision.solid.id && rock.alive);
                        if (asteroid) {
                            asteroid.armor = 0;
                            asteroid.alive = false;
                            addEffect({ type: "rock-destroy", player: mover.player, turn: working.turn, pos: cloneVec(collision.point), label: asteroid.id }, at);
                            destroyAt(asteroid.id, "asteroid", at);
                            working.log.unshift(`${mover.label} destroyed ${asteroid.id} in the collision.`);
                        }
                    }
                    else {
                        destroyAt(mover.id, "torpedo", at);
                        const asteroid = working.asteroids.find((rock) => rock.id === collision.solid.id && rock.alive);
                        if (asteroid) {
                            asteroid.armor = 0;
                            asteroid.alive = false;
                            addEffect({ type: "rock-destroy", player: mover.player, turn: working.turn, pos: cloneVec(collision.point), label: asteroid.id }, at);
                            destroyAt(asteroid.id, "asteroid", at);
                            working.log.unshift(`${sourceLabel(mover)} destroyed ${asteroid.id}.`);
                        }
                        else
                            working.log.unshift(`${sourceLabel(mover)} detonated on the planet.`);
                    }
                }
                else if (mover.pos.x < 0 || mover.pos.y < 0 || mover.pos.x > WORLD_W || mover.pos.y > WORLD_H) {
                    mover.pos = { x: clamp(mover.pos.x, 0, WORLD_W), y: clamp(mover.pos.y, 0, WORLD_H) };
                    mover.alive = false;
                    if ("kind" in mover) {
                        mover.armor = 0;
                        addEffect({ type: "destroy", player: mover.player, turn: working.turn, pos: cloneVec(mover.pos), label: `${mover.label} LOST` }, at);
                        destroyAt(mover.id, "unit", at);
                        working.log.unshift(`${mover.label} left the battlefield.`);
                    }
                    else
                        destroyAt(mover.id, "torpedo", at);
                }
            });
            for (const asteroid of working.asteroids.filter((rock) => rock.alive)) {
                const oldAsteroid = asteroidPosition(asteroid, previousTime);
                const newAsteroid = asteroidPosition(asteroid, working.time);
                for (const target of working.units.filter(isTargetable)) {
                    const key = `${asteroid.id}:${target.id}`;
                    if (asteroidHits.has(key))
                        continue;
                    const oldTarget = unitStarts.get(target.id) ?? target.pos;
                    const relativeStart = sub(oldTarget, oldAsteroid);
                    const relativeEnd = sub(target.pos, newAsteroid);
                    const t = segmentCircle(relativeStart, relativeEnd, { x: 0, y: 0 }, asteroid.r + target.r);
                    if (t === null)
                        continue;
                    const at = timelineAt((step + t) / STEPS);
                    const point = lerpVec(oldAsteroid, newAsteroid, t);
                    asteroidHits.add(key);
                    damageTarget(target, target.player, point, 2, `${asteroid.id} collision`, at);
                    asteroid.armor = 0;
                    asteroid.alive = false;
                    addEffect({ type: "rock-destroy", player: target.player, turn: working.turn, pos: cloneVec(point), label: asteroid.id }, at);
                    destroyAt(asteroid.id, "asteroid", at);
                    working.log.unshift(`${asteroid.id} was destroyed in the collision.`);
                    break;
                }
            }
            const targets = working.units.filter(isTargetable);
            working.missiles.filter((m) => m.alive).forEach((missile) => {
                for (const target of targets) {
                    if (!target.alive || target.id === missile.sourceId && missile.age < 1)
                        continue;
                    if (distance(missile.pos, target.pos) <= missile.r + target.r) {
                        const at = timelineAt((step + 1) / STEPS);
                        missile.alive = false;
                        destroyAt(missile.id, "torpedo", at);
                        damageTarget(target, missile.player, missile.pos, 2, "torpedo", at);
                        break;
                    }
                }
            });
            const collidable = working.units.filter(isTargetable);
            const handledPairs = new Set<string>();
            for (const ship of collidable.filter((unit) => unit.kind === "ship"))
                for (const other of collidable) {
                    if (ship.id === other.id || !ship.alive || !other.alive || distance(ship.pos, other.pos) > ship.r + other.r)
                        continue;
                    const key = [ship.id, other.id].sort().join(":");
                    if (handledPairs.has(key))
                        continue;
                    handledPairs.add(key);
                    const at = timelineAt((step + 1) / STEPS);
                    const point = lerpVec(ship.pos, other.pos, .5);
                    damageTarget(ship, other.player, point, 2, `${other.label} collision`, at);
                    if (other.alive)
                        damageTarget(other, ship.player, point, 2, `${ship.label} collision`, at);
                    working.log.unshift(`${ship.label} and ${other.label} collided.`);
                }
            const missiles = working.missiles.filter((m) => m.alive);
            for (let i = 0; i < missiles.length; i += 1)
                for (let j = i + 1; j < missiles.length; j += 1) {
                    const a = missiles[i], b = missiles[j];
                    if (a.sourceId === b.sourceId)
                        continue;
                    if (a.alive && b.alive && distance(a.pos, b.pos) <= a.r + b.r) {
                        const at = timelineAt((step + 1) / STEPS);
                        a.alive = false;
                        b.alive = false;
                        addEffect({ type: "impact", player: a.player, turn: working.turn, pos: lerpVec(a.pos, b.pos, .5) }, at);
                        destroyAt(a.id, "torpedo", at);
                        destroyAt(b.id, "torpedo", at);
                    }
                }
            if (step % 3 === 0 || step === STEPS - 1) {
                working.units.filter((u) => u.kind === "ship").forEach((u) => { const t = tracks.get(u.id); if (t)
                    t.push(cloneVec(u.pos)); });
                working.missiles.forEach((m) => { const t = tracks.get(m.id); if (t)
                    t.push(cloneVec(m.pos)); });
            }
            const outcome = findOutcome(working);
            if (outcome.winner !== null || outcome.draw)
                break;
        }
        // Keep spent torpedoes as inert records so their final dashed tracks remain classifiable
        // and exportable. Physics, targeting, and rendering already ignore `alive: false` objects.
        working.history.push(...events);
        const resolution: Resolution = { game: working, tracks, duration: reducedMotion.current ? 120 : 1800, started: performance.now(), progress: 0, lead, effects, deaths, damage, births };
        gameRef.current.phase = "resolving";
        resolutionRef.current = resolution;
        aimRef.current.pointerId = null;
        moveCameraTo({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: fitZoom() });
        setLiveMessage(`Resolving turn ${working.turn}.`);
        bump();
        const animate = (now: number) => { const active = resolutionRef.current; if (active !== resolution)
            return; active.progress = clamp((now - active.started) / active.duration, 0, 1); draw(); if (active.progress < 1)
            rafRef.current = requestAnimationFrame(animate);
        else
            finishResolution(active); };
        rafRef.current = requestAnimationFrame(animate);
        resolutionTimeoutRef.current = window.setTimeout(() => { if (resolutionRef.current === resolution)
            finishResolution(resolution); }, resolution.duration + 900);
    }, [bump, commanderCamera, computeTelemetry, draw, finishResolution, fitZoom, moveCameraTo]);
    const runCpuStep = useCallback(() => {
        const game = gameRef.current;
        if (!isCpuTurn(game)) {
            cpuThinkingRef.current = false;
            return;
        }
        const unordered = planningActors(game, 1).filter((actor) => !actorHasOrder(game, actor.id));
        let choice: CpuChoice | null = null;
        for (const actor of unordered) {
            choice = cpuChoiceForActor(game, actor);
            if (choice)
                break;
        }
        if (!choice) {
            cpuThinkingRef.current = false;
            setLiveMessage("CPU Commander has finished plotting. Unassigned assets will coast.");
            simulateAction(aimRef.current.raw, aimRef.current.power, true);
            return;
        }
        game.selectedId = choice.sourceId;
        game.action = choice.action;
        aimRef.current.raw = cloneVec(choice.raw);
        aimRef.current.power = choice.power;
        aimRef.current.keyboard = true;
        setPower(choice.power);
        computeTelemetry(choice.raw, choice.power);
        setLiveMessage(choice.note);
        bump();
        draw();
        window.clearTimeout(cpuCommitTimerRef.current);
        cpuCommitTimerRef.current = window.setTimeout(() => {
            cpuThinkingRef.current = false;
            simulateAction(choice!.raw, choice!.power);
        }, reducedMotion.current ? 30 : 420);
    }, [bump, computeTelemetry, draw, simulateAction]);
    useEffect(() => {
        const game = gameRef.current;
        window.clearTimeout(cpuTimerRef.current);
        if (!isCpuTurn(game)) {
            cpuThinkingRef.current = false;
            return;
        }
        if (cpuThinkingRef.current)
            return;
        cpuTimerRef.current = window.setTimeout(() => { cpuThinkingRef.current = true; runCpuStep(); }, reducedMotion.current ? 50 : 450);
        return () => window.clearTimeout(cpuTimerRef.current);
    }, [gameView.currentPlayer, gameView.pendingOrders.length, gameView.phase, gameView.settings.opponent, runCpuStep]);
    const beginVectorPlot = useCallback((event: React.PointerEvent<HTMLCanvasElement>, source: CommandSource) => {
        if (isCpuTurn(gameRef.current))
            return;
        const canvas = canvasRef.current!;
        const aim = aimRef.current;
        aim.pointerId = event.pointerId;
        aim.anchor = cloneVec(source.pos);
        aim.previousRaw = cloneVec(aim.raw);
        aim.previousPower = aim.power;
        aim.moved = false;
        aim.keyboard = false;
        gameRef.current.phase = "aiming";
        canvas.setPointerCapture(event.pointerId);
        canvas.focus({ preventScroll: true });
        setLiveMessage(`${gameRef.current.action} vector editing. Drag in the intended direction; release sets the vector without firing.`);
        bump();
        draw();
    }, [bump, draw]);
    const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        if (event.pointerType === "mouse" && event.button !== 0)
            return;
        cancelAnimationFrame(cameraRafRef.current);
        const game = gameRef.current;
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        pointerMap.current.set(event.pointerId, local);
        if (event.pointerType !== "mouse")
            canvas.setPointerCapture(event.pointerId);
        if (pointerMap.current.size >= 2) {
            if (game.phase === "aiming") {
                const aim = aimRef.current;
                game.phase = "ready";
                aim.pointerId = null;
                aim.raw = cloneVec(aim.previousRaw);
                aim.power = aim.previousPower;
                aim.moved = false;
                setPower(aim.power);
                computeTelemetry(aim.raw, aim.power);
                setLiveMessage("Vector edit cancelled. Two-finger camera controls active.");
            }
            const ids = Array.from(pointerMap.current.keys()).slice(0, 2);
            const a = pointerMap.current.get(ids[0])!;
            const b = pointerMap.current.get(ids[1])!;
            pinchRef.current = { ids, distance: Math.max(10, distance(a, b)), midpoint: lerpVec(a, b, .5), camera: { ...cameraRef.current } };
            panRef.current = null;
            bump();
            draw();
            return;
        }
        if (game.phase !== "ready" && game.phase !== "aiming") {
            panRef.current = { pointerId: event.pointerId, start: local, camera: { ...cameraRef.current } };
            canvas.setPointerCapture(event.pointerId);
            canvas.style.cursor = "grabbing";
            return;
        }
        if (isCpuTurn(game)) {
            panRef.current = { pointerId: event.pointerId, start: local, camera: { ...cameraRef.current } };
            canvas.setPointerCapture(event.pointerId);
            canvas.style.cursor = "grabbing";
            return;
        }
        const current = planningSource(game);
        const aim = aimRef.current;
        if (current && (!isUnit(current) || isTargetable(current))) {
            const origin = worldToScreen(current.pos);
            const handle = add(origin, mul(unitVec(aim.raw), Math.max(12, aim.power * vectorControlRadius())));
            const hitRadius = event.pointerType === "mouse" ? 19 : 28;
            if (distance(local, handle) <= hitRadius) {
                beginVectorPlot(event, current);
                return;
            }
        }
        const world = screenToWorld(local);
        const candidates: {
            source: CommandSource;
        }[] = [];
        game.units.filter((u) => isTargetable(u) && u.player === game.currentPlayer).forEach((unit) => candidates.push({ source: unit }));
        const hit = candidates.map((candidate) => ({ ...candidate, d: distance(world, candidate.source.pos) })).filter((candidate) => candidate.d <= candidate.source.r + 24 / cameraRef.current.zoom).sort((a, b) => a.d - b.d)[0];
        if (hit) {
            if (game.selectedId !== hit.source.id) {
                game.selectedId = hit.source.id;
                if (isUnit(hit.source)) {
                    if (!actorHasOrder(game, hit.source.id))
                        game.action = hit.source.kind === "base" ? "LASER" : "THRUST";
                    else if (actionDisabledReason(game, hit.source, game.action))
                        game.action = preferredAction(game, hit.source) ?? game.action;
                    const direction = hit.source.kind === "ship" && mag(hit.source.vel) > .01 ? unitVec(hit.source.vel) : { x: Math.cos(hit.source.heading), y: Math.sin(hit.source.heading) };
                    aim.raw = mul(direction, aim.power * MAX_VECTOR_INPUT);
                }
                computeTelemetry(aim.raw, aim.power);
            }
            beginVectorPlot(event, hit.source);
            return;
        }
        panRef.current = { pointerId: event.pointerId, start: local, camera: { ...cameraRef.current } };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "grabbing";
    }, [beginVectorPlot, bump, computeTelemetry, draw, screenToWorld, vectorControlRadius, worldToScreen]);
    const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        if (pointerMap.current.has(event.pointerId))
            pointerMap.current.set(event.pointerId, local);
        const pinch = pinchRef.current;
        if (pinch && pinch.ids.every((id) => pointerMap.current.has(id))) {
            const a = pointerMap.current.get(pinch.ids[0])!;
            const b = pointerMap.current.get(pinch.ids[1])!;
            const mid = lerpVec(a, b, .5);
            const dist = Math.max(10, distance(a, b));
            const next = { ...pinch.camera, zoom: pinch.camera.zoom * dist / pinch.distance };
            next.x -= (mid.x - pinch.midpoint.x) / next.zoom;
            next.y -= (mid.y - pinch.midpoint.y) / next.zoom;
            clampCamera(next);
            cameraRef.current = next;
            draw();
            return;
        }
        const pan = panRef.current;
        if (pan && pan.pointerId === event.pointerId) {
            const next = { ...pan.camera, x: pan.camera.x - (local.x - pan.start.x) / pan.camera.zoom, y: pan.camera.y - (local.y - pan.start.y) / pan.camera.zoom };
            clampCamera(next);
            cameraRef.current = next;
            draw();
            return;
        }
        const aim = aimRef.current;
        if (gameRef.current.phase !== "aiming" || aim.pointerId !== event.pointerId)
            return;
        const origin = worldToScreen(aim.anchor);
        const delta = sub(local, origin);
        const plottedDistance = mag(delta);
        if (plottedDistance < 2)
            return;
        const nextPower = clamp(plottedDistance / vectorControlRadius(), .06, 1);
        aim.raw = mul(unitVec(delta), nextPower * MAX_VECTOR_INPUT);
        aim.power = nextPower;
        aim.moved = true;
        computeTelemetry(aim.raw, nextPower);
        setPower(nextPower);
        bump();
        draw();
    }, [bump, clampCamera, computeTelemetry, draw, vectorControlRadius, worldToScreen]);
    const endPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
        event.preventDefault();
        pointerMap.current.delete(event.pointerId);
        if (pinchRef.current) {
            if (pointerMap.current.size < 2)
                pinchRef.current = null;
            draw();
            return;
        }
        if (panRef.current?.pointerId === event.pointerId) {
            panRef.current = null;
            if (canvasRef.current)
                canvasRef.current.style.cursor = "crosshair";
            draw();
            return;
        }
        const aim = aimRef.current;
        if (gameRef.current.phase === "aiming" && aim.pointerId === event.pointerId) {
            gameRef.current.phase = "ready";
            aim.pointerId = null;
            if (cancelled || !aim.moved) {
                aim.raw = cloneVec(aim.previousRaw);
                aim.power = aim.previousPower;
                setPower(aim.power);
                computeTelemetry(aim.raw, aim.power);
                setLiveMessage(cancelled ? "Vector edit cancelled; the previous vector was restored." : "Vector unchanged. Drag the diamond handle or selected object to plot a new vector.");
            }
            else {
                setLiveMessage(`Vector set: ${vectorDescription(aim.raw, aim.power)}. Review the trajectory, then lock the ${gameRef.current.action} order.`);
            }
            aim.moved = false;
            bump();
            draw();
        }
    }, [bump, computeTelemetry, draw]);
    const onWheel = useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        if (gameRef.current.phase === "aiming")
            return;
        cancelAnimationFrame(cameraRafRef.current);
        const rect = canvasRef.current!.getBoundingClientRect();
        const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const before = screenToWorld(local);
        const next = { ...cameraRef.current, zoom: cameraRef.current.zoom * Math.exp(-event.deltaY * .0012) };
        clampCamera(next);
        const after = screenToWorld(local, next);
        next.x += before.x - after.x;
        next.y += before.y - after.y;
        clampCamera(next);
        cameraRef.current = next;
        draw();
    }, [clampCamera, draw, screenToWorld]);
    const commitKeyboard = useCallback(() => {
        if (gameRef.current.phase !== "ready" || isCpuTurn(gameRef.current))
            return;
        const source = commandSource(gameRef.current);
        if (!source || isUnit(source) && !isTargetable(source))
            return;
        const reason = actionDisabledReason(gameRef.current, source, gameRef.current.action);
        if (reason) {
            setLiveMessage(reason);
            return;
        }
        simulateAction(mul(unitVec(aimRef.current.raw), power * MAX_VECTOR_INPUT), power);
    }, [power, simulateAction]);
    const finishCommanderPlanning = useCallback(() => {
        if (gameRef.current.phase !== "ready" || isCpuTurn(gameRef.current))
            return;
        simulateAction(aimRef.current.raw, aimRef.current.power, true);
    }, [simulateAction]);
    const fitBattlefield = useCallback(() => { moveCameraTo({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: fitZoom() }); }, [fitZoom, moveCameraTo]);
    const focusSelected = useCallback(() => { const source = commandSource(gameRef.current); if (!source || isUnit(source) && !isTargetable(source))
        return; moveCameraTo({ x: source.pos.x, y: source.pos.y, zoom: defaultZoom() }); }, [defaultZoom, moveCameraTo]);
    const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
        const aim = aimRef.current;
        const key = event.key.toLowerCase();
        if (gameRef.current.phase === "aiming" && key === "escape") {
            event.preventDefault();
            const pointerId = aim.pointerId;
            gameRef.current.phase = "ready";
            aim.pointerId = null;
            aim.raw = cloneVec(aim.previousRaw);
            aim.power = aim.previousPower;
            aim.moved = false;
            if (pointerId !== null) {
                pointerMap.current.delete(pointerId);
                try {
                    canvasRef.current?.releasePointerCapture(pointerId);
                }
                catch { }
            }
            setPower(aim.power);
            computeTelemetry(aim.raw, aim.power);
            setLiveMessage("Vector edit cancelled; the previous vector was restored.");
            bump();
            draw();
            return;
        }
        if (gameRef.current.phase !== "ready")
            return;
        if (isCpuTurn(gameRef.current) && !["w", "a", "s", "d", "f", "h", "+", "=", "-"].includes(key)) {
            event.preventDefault();
            return;
        }
        if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "enter", "[", "]"].includes(key))
            event.preventDefault();
        if (key === "0")
            setAction("NONE");
        else if (key === "1")
            setAction("THRUST");
        else if (key === "2")
            setAction("TORPEDO");
        else if (key === "3")
            setAction("LASER");
        else if (key === "4")
            setAction("DEPLOY");
        else if (key === "[" || key === "]") {
            const game = gameRef.current;
            const available: CommandSource[] = game.units.filter((u) => u.player === game.currentPlayer && isTargetable(u));
            const i = available.findIndex((source) => source.id === game.selectedId);
            const offset = key === "]" ? 1 : -1;
            const next = available[(i + offset + available.length) % available.length];
            if (next && isUnit(next))
                setSelected(next.id);
        }
        else if (key.startsWith("arrow")) {
            let angle = Math.atan2(aim.raw.y, aim.raw.x);
            let nextPower = power;
            const angleStep = (event.shiftKey ? 1 : 5) * Math.PI / 180;
            const powerStep = event.shiftKey ? .01 : .05;
            if (key === "arrowleft")
                angle -= angleStep;
            if (key === "arrowright")
                angle += angleStep;
            if (key === "arrowup")
                nextPower = clamp(power + powerStep, .06, 1);
            if (key === "arrowdown")
                nextPower = clamp(power - powerStep, .06, 1);
            const nextRaw = mul({ x: Math.cos(angle), y: Math.sin(angle) }, nextPower * MAX_VECTOR_INPUT);
            setPlottedVector(angle, nextPower, `Vector set: ${vectorDescription(nextRaw, nextPower)}.`);
        }
        else if (key === " " || key === "enter")
            commitKeyboard();
        else if (["w", "a", "s", "d"].includes(key)) {
            cancelAnimationFrame(cameraRafRef.current);
            const amount = 100 / cameraRef.current.zoom;
            if (key === "w")
                cameraRef.current.y -= amount;
            if (key === "s")
                cameraRef.current.y += amount;
            if (key === "a")
                cameraRef.current.x -= amount;
            if (key === "d")
                cameraRef.current.x += amount;
            clampCamera(cameraRef.current);
            draw();
        }
        else if (key === "f")
            fitBattlefield();
        else if (key === "h")
            setViewMode((m) => m === "tactical" ? "history" : "tactical");
        else if (key === "+" || key === "=") {
            cancelAnimationFrame(cameraRafRef.current);
            cameraRef.current.zoom *= 1.15;
            clampCamera(cameraRef.current);
            draw();
        }
        else if (key === "-") {
            cancelAnimationFrame(cameraRafRef.current);
            cameraRef.current.zoom /= 1.15;
            clampCamera(cameraRef.current);
            draw();
        }
    }, [bump, clampCamera, commitKeyboard, computeTelemetry, draw, fitBattlefield, power, setAction, setPlottedVector, setSelected]);
    const startBattle = useCallback(() => {
        window.clearTimeout(resolutionTimeoutRef.current);
        window.clearTimeout(cpuTimerRef.current);
        window.clearTimeout(cpuCommitTimerRef.current);
        cpuThinkingRef.current = false;
        cancelAnimationFrame(rafRef.current);
        gameRef.current = createGame({ ...settingsDraft, actionsPerCommander: 1, colors: [...settingsDraft.colors] }, "ready");
        resolutionRef.current = null;
        replayRef.current.active = false;
        aimRef.current.raw = { x: 1, y: 0 };
        aimRef.current.power = .45;
        setPower(.45);
        setViewMode("tactical");
        setReplayActive(false);
        setGameoverMinimized(false);
        moveCameraTo(commanderCamera(gameRef.current, 0), false);
        computeTelemetry(aimRef.current.raw, .45);
        setLiveMessage("Commander 1 has initiative. Assign one action to each asset, then finish planning. Unassigned ships coast.");
        bump();
        draw();
    }, [bump, commanderCamera, computeTelemetry, draw, moveCameraTo, settingsDraft]);
    const resetToSetup = useCallback(() => {
        window.clearTimeout(resolutionTimeoutRef.current);
        window.clearTimeout(cpuTimerRef.current);
        window.clearTimeout(cpuCommitTimerRef.current);
        cpuThinkingRef.current = false;
        cancelAnimationFrame(rafRef.current);
        cancelAnimationFrame(cameraRafRef.current);
        setSettingsDraft({ ...gameRef.current.settings, actionsPerCommander: 1, colors: [...gameRef.current.settings.colors] });
        gameRef.current = createGame(gameRef.current.settings, "setup");
        resolutionRef.current = null;
        replayRef.current.active = false;
        aimRef.current.raw = { x: 1, y: 0 };
        aimRef.current.power = .45;
        setPower(.45);
        setViewMode("tactical");
        setReplayActive(false);
        setGameoverMinimized(false);
        cameraRef.current = { x: 560, y: 1000, zoom: defaultZoom() };
        clampCamera(cameraRef.current);
        setLiveMessage("Choose the match format.");
        bump();
        draw();
    }, [bump, clampCamera, defaultZoom, draw]);
    const restart = useCallback(() => {
        if (!window.confirm("Erase this battle record and start a new match?"))
            return;
        resetToSetup();
    }, [resetToSetup]);
    const stopReplay = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        replayRef.current.active = false;
        replayRef.current.progress = 1;
        setReplayActive(false);
        setGameoverMinimized(false);
        setLiveMessage("Replay stopped. Battle history shown.");
        draw();
    }, [draw]);
    const startReplay = useCallback(() => {
        if (!gameRef.current.history.length) {
            setLiveMessage("There is no battle history to replay yet.");
            return;
        }
        cancelAnimationFrame(rafRef.current);
        const turns = Math.max(1, ...gameRef.current.history.map((event) => event.turn));
        const duration = reducedMotion.current ? 900 : clamp(turns * 1400, 7000, 24000);
        replayRef.current = { active: true, progress: 0, started: performance.now(), duration };
        setReplayActive(true);
        setGameoverMinimized(true);
        setViewMode("history");
        moveCameraTo({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: fitZoom() });
        setLiveMessage("Battle replay started.");
        const animateReplay = (now: number) => {
            const replay = replayRef.current;
            if (!replay.active)
                return;
            replay.progress = clamp((now - replay.started) / replay.duration, 0, 1);
            draw();
            if (replay.progress < 1)
                rafRef.current = requestAnimationFrame(animateReplay);
            else {
                replay.active = false;
                setReplayActive(false);
                setGameoverMinimized(false);
                setLiveMessage("Replay complete. Battle history shown.");
                draw();
            }
        };
        rafRef.current = requestAnimationFrame(animateReplay);
    }, [draw, fitZoom, moveCameraTo]);
    const toggleGameoverPanel = useCallback(() => {
        setGameoverMinimized((value) => !value);
        setViewMode("history");
        setLiveMessage(gameoverMinimized ? "Results panel expanded." : "Results panel minimized. Full battle history remains visible.");
    }, [gameoverMinimized]);
    const game = gameView;
    const cpuTurn = isCpuTurn(game);
    const selected = commandSource(game) ?? preferredUnit(game, game.currentPlayer)!;
    const selectedUnit = isUnit(selected) ? selected : null;
    const selectedTorpedo = isUnit(selected) ? null : selected;
    const telemetry = telemetryView;
    const unitsForPlayer = game.units.filter((u) => u.player === game.currentPlayer && isTargetable(u));
    const aliveShips = [0, 1].map((p) => game.units.filter((u) => u.player === p && u.kind === "ship" && u.alive).length);
    const reserveShips = [0, 1].map((p) => game.units.filter((u) => u.player === p && u.kind === "ship" && u.alive && !u.deployed).length);
    const activeShips = [0, 1].map((p) => game.units.filter((u) => u.player === p && u.kind === "ship" && u.alive && u.deployed));
    const availabilityGame = game.phase === "aiming" ? { ...game, phase: "ready" as Phase } : game;
    const actionReason = (action: ActionKind) => actionDisabledReason(availabilityGame, selected, action);
    const declaredActionReason = actionReason(game.action);
    const selectedActor = actorForSource(game, selected);
    const needsCommit = game.phase === "ready" && !declaredActionReason && Boolean(selectedActor && !actorHasOrder(game, selectedActor.id));
    const fleetNotice = game.log.slice(0, 6).find((line) => line.includes("deployed from") || line.includes("destroyed inside") || line.includes("destroyed by"));
    const playerClass = game.currentPlayer === 1 ? "player-two" : "";
    const selectedActions = (selectedUnit?.kind === "base" ? ["LASER", "DEPLOY", "NONE"] : ["THRUST", "TORPEDO", "LASER", "NONE"]) as ActionKind[];
    const plottedAngle = vectorAngleDegrees(vectorView);
    const plottedDirection = vectorDirectionName(vectorView);
    const plottedPercent = Math.round(power * 100);
    const updateVectorFromControls = (angleDegrees: number, nextPower: number, announce = false) => {
        const normalizedDegrees = (angleDegrees + 360) % 360;
        const radians = normalizedDegrees * Math.PI / 180;
        const plottedPower = clamp(nextPower, .06, 1);
        const raw = mul({ x: Math.cos(radians), y: Math.sin(radians) }, plottedPower * MAX_VECTOR_INPUT);
        setPlottedVector(radians, plottedPower, announce ? `Vector set: ${vectorDescription(raw, plottedPower)}.` : undefined);
    };
    const setHistoryLevel = (level: number) => {
        const next = clamp(Math.round(level), 0, HISTORY_LEVELS.length - 1);
        gameRef.current.settings.historyOpacity = next;
        setSettingsDraft((settings) => ({ ...settings, historyOpacity: next }));
        setLiveMessage(`Tactical history opacity: ${HISTORY_LABELS[next]}.`);
        bump();
        draw();
    };
    const displayColors = game.phase === "setup" ? settingsDraft.colors : game.settings.colors;
    const shellStyle = { "--p1": displayColors[0], "--p2": displayColors[1], "--commander": game.phase === "setup" ? displayColors[0] : displayColors[game.currentPlayer], "--ui-scale": UI_SCALE_VALUES[uiScale] } as CSSProperties;
    const actionSlots = planningActors(game, 0).length + planningActors(game, 1).length;
    const currentActors = planningActors(game, game.currentPlayer);
    const unorderedActors = currentActors.filter((actor) => !actorHasOrder(game, actor.id));
    const matchStats = {
        lasers: game.history.filter((event) => event.type === "marker" && event.label === "LASER").length,
        torpedoes: game.history.filter((event) => event.type === "marker" && event.label === "TORPEDO").length,
        deployed: game.history.filter((event) => event.type === "marker" && event.label === "DEPLOY").length,
        shipsLost: game.history.filter((event) => event.type === "destroy" && /^[AB]-\d/.test(event.label)).length,
        impacts: game.history.filter((event) => event.type === "impact").length,
    };
    return (<main className="game-shell" data-theme="dark" style={shellStyle}>
      <a className="skip-link" href="#command-deck">Skip to command controls</a>
      <header className="topbar">
        <div className="brand"><p>Proctor Creative</p><h1>GRAPHITE_FLEET <span className="subtitle-tag">{"// SPACE BATTLE"}</span></h1></div>
        <div className="turn-readout" aria-live="polite"><span>{game.phase === "setup" ? "FLEET RULES · MATCH SETUP" : `ROUND ${String(game.turn).padStart(2, "0")} · ${game.pendingOrders.length}/${actionSlots} ORDERS · ${game.phase.toUpperCase()}`}</span><strong style={{ color: game.settings.colors[game.currentPlayer] }}>{game.phase === "setup" ? "CHOOSE FORMAT" : `COMMANDER ${game.currentPlayer + 1}${game.settings.opponent === "cpu" && game.currentPlayer === 1 ? " · CPU" : ""} · ${unorderedActors.length} UNASSIGNED · SHIPS ${aliveShips[0]}—${aliveShips[1]}`}</strong></div>
      </header>

      <section className="game-layout">
        <div className="battlefield-wrap" ref={wrapRef}>
          <canvas ref={canvasRef} className="battlefield" tabIndex={0} aria-label={`Graphite Fleet battlefield with ${game.asteroids.filter((asteroid) => asteroid.alive).length} destructible asteroids orbiting the central planet. Round ${game.turn}; ${game.pendingOrders.length} actions committed. Commander ${game.currentPlayer + 1}, ${sourceLabel(selected)} selected, ${game.action} declared. Vector ${vectorDescription(vectorView, power)}.${telemetry.impact ? " Impact predicted; a yellow X marks the collision point." : ""} ${unorderedActors.length} assets have no order and will coast if applicable.`} aria-describedby="canvas-help" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={(e) => endPointer(e)} onPointerCancel={(e) => endPointer(e, true)} onWheel={onWheel} onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}/>
          <p className="visually-hidden" id="canvas-help">Select an asset, choose one action in the side command panel, plot its vector, and commit it. Every deployed ship and each base may receive one action per round. Unassigned ships coast. Dashed yellow rings mark ships awaiting commands; green rings mark committed units. A yellow X marks a predicted impact. Empty-space drag pans and two-finger gestures pan or zoom. Key 0 chooses coast or no action. Keys 1 through 4 declare thrust, torpedo, laser, and deploy. Arrow keys adjust the vector; hold Shift for fine adjustment. Left and right bracket cycle objects. Space or Enter commits the action. W A S D pan. Plus and minus zoom. F fits the battlefield. H toggles history.</p>
          <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</div>
          {game.phase === "resolving" && <div className="resolve-banner">Universe advancing · 6 seconds</div>}
          {cpuTurn && <div className="cpu-banner" role="status">CPU Commander plotting</div>}
          {game.phase === "gameover" && !replayActive && <section className={`gameover-panel ${gameoverMinimized ? "minimized" : ""}`} role="dialog" aria-modal="false" aria-labelledby={gameoverMinimized ? undefined : "victory-title"} aria-label={gameoverMinimized ? "Battle results minimized" : undefined} onPointerDown={(event) => event.stopPropagation()}>{gameoverMinimized ? <><button className="gameover-expand" type="button" aria-label="Expand battle results" onClick={toggleGameoverPanel}>▣ <span>RESULTS</span></button><button className="gameover-new-match" type="button" onClick={resetToSetup}>New Match</button></> : <><button className="gameover-minimize" type="button" aria-label="Minimize battle results" onClick={toggleGameoverPanel}>▁</button><p className="eyebrow">Battle record complete</p><h2 id="victory-title">{game.draw ? "Draw." : `Commander ${game.winner! + 1} wins.`}</h2><p>{game.draw ? "No controllable assets remain on either side." : "The opposing commander has no controllable assets remaining."}</p><dl className="battle-stats"><div><dt>Rounds</dt><dd>{game.turn}</dd></div><div><dt>Ships deployed</dt><dd>{matchStats.deployed}</dd></div><div><dt>Ships lost</dt><dd>{matchStats.shipsLost}</dd></div><div><dt>Lasers fired</dt><dd>{matchStats.lasers}</dd></div><div><dt>Torpedoes fired</dt><dd>{matchStats.torpedoes}</dd></div><div><dt>Impact marks</dt><dd>{matchStats.impacts}</dd></div></dl><div className="gameover-actions"><button autoFocus type="button" onClick={startReplay}>Watch replay</button><button type="button" onClick={toggleGameoverPanel}>Minimize</button><button type="button" onClick={resetToSetup}>New match</button></div></>}</section>}
          {replayActive && <div className="replay-controls" role="status"><span>Battle replay</span><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={stopReplay}>Stop replay</button></div>}
        </div>

        <aside className="command-deck" id="command-deck" aria-label="Command deck">
          <section className="deck-section command-section">
            <div className="command-left">
              <p className="eyebrow">Selected object</p><div className="selected-title"><h2>{sourceLabel(selected)}</h2><span>{selectedUnit ? `${selectedUnit.kind.toUpperCase()} · ${actorHasOrder(game, selectedUnit.id) ? "ORDER COMMITTED" : "NO ORDER"} · ${reserveShips[game.currentPlayer]} RESERVE` : `TORPEDO · COMMANDED BY ${actorForSource(game, selected)?.label ?? "LOST SHIP"}`}</span></div>
              <div className="resource-grid">
                <div><span>Stored velocity</span><strong>{mag(selected.vel).toFixed(1)} u/s</strong></div>
                {selectedUnit ? <><div><span>{selectedUnit.kind === "base" ? "Base HP" : "Ship HP"}</span><strong>{selectedUnit.kind === "base" ? `${selectedUnit.armor}/${game.settings.fleetSize * 3 + 1}` : `${selectedUnit.armor}/3`}</strong></div><div><span>{selectedUnit.kind === "base" ? "Ships inside" : "Torpedoes"}</span><strong>{selectedUnit.kind === "base" ? reserveShips[selectedUnit.player] : selectedUnit.missiles}</strong></div><div><span>Laser</span><strong>ALWAYS READY</strong></div></> : <><div><span>Correction</span><strong>{selectedTorpedo?.correctionAvailable ? "READY" : "SPENT"}</strong></div><div><span>Flight time</span><strong>{selectedTorpedo?.age.toFixed(0)} s</strong></div><div><span>Status</span><strong>IN FLIGHT</strong></div></>}
              </div>
            </div>
            <div>
              <div className="unit-tabs" aria-label="Select active unit">{unitsForPlayer.map((u) => <button key={u.id} type="button" disabled={game.phase !== "ready" || cpuTurn} title={cpuTurn ? "CPU commander is plotting" : undefined} className={u.id === selectedUnit?.id ? `active ${playerClass}` : ""} onClick={() => setSelected(u.id)}>{u.kind === "base" ? "BASE" : u.label}</button>)}</div>
              <p className="selected-action-label">Available for <strong>{sourceLabel(selected)}</strong></p>
              <div className={`action-row ${selectedActions.length <= 2 ? "compact-actions" : ""}`}>{selectedActions.map((action) => { const reason = actionReason(action); const phaseLocked = game.phase !== "ready" || cpuTurn; const phaseReason = cpuTurn ? "CPU commander is plotting" : game.phase === "aiming" ? "vector is being edited" : "action phase is not ready"; const torpedoCount = action === "TORPEDO" && selectedUnit?.kind === "ship" ? selectedUnit.missiles : 0; const label = actionLabel(action, selected); const accessibleLabel = action === "TORPEDO" ? `${label}, ${torpedoCount} remaining` : label; return <button key={action} type="button" disabled={phaseLocked || Boolean(reason)} title={reason ?? (phaseLocked ? phaseReason : `${label} ready`)} aria-label={reason ? `${accessibleLabel} unavailable: ${reason}` : phaseLocked ? `${accessibleLabel} unavailable: ${phaseReason}` : accessibleLabel} className={game.action === action ? `active ${playerClass}` : ""} onClick={() => setAction(action)}><span>{label}</span>{action === "TORPEDO" && <span className="torpedo-icons" aria-hidden="true">{Array.from({ length: torpedoCount }).map((_, index) => <i key={index}/>)}</span>}{reason && <span className="disabled-mark" aria-hidden="true">×</span>}</button>; })}</div>
              <p className="reserve-readout"><strong>{activeShips[game.currentPlayer].length} DEPLOYED</strong> · {reserveShips[game.currentPlayer]} INSIDE BASE</p>
              {fleetNotice && <p className="fleet-notice" role="status">{fleetNotice}</p>}
              {game.turn === 1 && <p className="first-turn-hint" role="note">SELECT ASSET → CHOOSE ACTION → COMMIT ACTION »</p>}
              <p className={`action-status ${cpuTurn ? "cpu" : declaredActionReason ? "unavailable" : telemetry.impact && game.action !== "NONE" ? "impact-warning" : "ready"}`} aria-live="polite">{cpuTurn ? "CPU COMMANDER IS PLOTTING" : game.action === "NONE" ? `✓ ${actionLabel(game.action, selected)} ready — commit to spend this asset’s action` : game.phase === "aiming" ? `↗ Editing ${game.action} vector — release to set` : declaredActionReason ? `× ${game.action} unavailable — ${declaredActionReason}` : telemetry.impact ? `× IMPACT PREDICTED — open yellow X marks the collision point` : `✓ ${game.action} ready — plot, review, then commit`}</p>

              <details className="vector-plotter">
                <summary>Direct vector plotter</summary>
                <fieldset className="vector-plotter-fields" disabled={game.phase !== "ready" || cpuTurn} aria-describedby="vector-plotter-help">
                <p className="vector-readout"><span><small>Direction</small><strong>{plottedAngle}° · {plottedDirection}</strong></span><span><small>Power</small><strong>{plottedPercent}%</strong></span></p>
                <p className="visually-hidden" id="vector-plotter-help">Direction is measured clockwise from right. Adjust either slider or use the fine adjustment buttons. These controls set the same vector as the battlefield diamond handle.</p>
                <div className="vector-slider">
                  <label htmlFor="vectorAngle"><span>Direction</span><strong>{plottedAngle}°</strong></label>
                  <input id="vectorAngle" type="range" min="0" max="359" step="1" value={plottedAngle} aria-valuetext={`${plottedAngle} degrees, ${plottedDirection}`} onChange={(e) => updateVectorFromControls(Number(e.target.value), power)}/>
                </div>
                <div className="vector-slider">
                  <label htmlFor="actionPower"><span>Vector power</span><strong>{plottedPercent}%</strong></label>
                  <input id="actionPower" type="range" min="6" max="100" step="1" value={plottedPercent} aria-valuetext={`${plottedPercent} percent power`} onChange={(e) => updateVectorFromControls(plottedAngle, Number(e.target.value) / 100)}/>
                </div>
                <div className="vector-adjust-row" aria-label="Fine vector adjustment">
                  <button type="button" aria-label="Rotate vector 5 degrees left" onClick={() => updateVectorFromControls(plottedAngle - 5, power, true)}>↶ 5°</button>
                  <button type="button" aria-label="Rotate vector 5 degrees right" onClick={() => updateVectorFromControls(plottedAngle + 5, power, true)}>↷ 5°</button>
                  <button type="button" aria-label="Decrease vector power 5 percent" onClick={() => updateVectorFromControls(plottedAngle, power - .05, true)}>− Power</button>
                  <button type="button" aria-label="Increase vector power 5 percent" onClick={() => updateVectorFromControls(plottedAngle, power + .05, true)}>+ Power</button>
                </div>
                </fieldset>
              </details>
              <div className="commit-row"><button className={`commit-button ${needsCommit && !cpuTurn ? "needs-commit" : ""}`} type="button" disabled={game.phase !== "ready" || cpuTurn || Boolean(declaredActionReason)} title={cpuTurn ? "CPU commander is plotting" : declaredActionReason ?? (game.phase === "ready" ? `Commit ${actionLabel(game.action, selected)}` : "Finish setting the vector first")} onClick={commitKeyboard}>{game.turn === 1 ? "COMMIT ACTION »" : `Commit ${actionLabel(game.action, selected)}`}</button><button type="button" disabled={game.phase !== "ready" || cpuTurn || game.action === "NONE"} onClick={() => updateVectorFromControls(game.currentPlayer === 0 ? 0 : 180, .45, true)}>Reset vector</button></div>
              <button className="finish-planning" type="button" disabled={game.phase !== "ready" || cpuTurn} onClick={finishCommanderPlanning}>{cpuTurn ? "CPU commander plotting…" : `Finish commander · coast ${unorderedActors.filter((actor) => actor.kind === "ship").length} unassigned ship${unorderedActors.filter((actor) => actor.kind === "ship").length === 1 ? "" : "s"}`}</button>
            </div>
          </section>

          <section className="deck-section"><p className="eyebrow">Flight computer</p><div className="telemetry-grid">
            <div><span>Result speed</span><strong>{telemetry.speed}</strong></div><div><span>Solution</span><strong className={telemetry.consequence === "IMPACT" ? "warning" : ""}>{telemetry.consequence}</strong></div>
            <div><span>Periapsis</span><strong>{telemetry.periapsis}</strong></div><div><span>Closest approach</span><strong>{telemetry.closest}</strong></div><div style={{ gridColumn: "1 / -1" }}><span>Declared vector</span><strong>{telemetry.vector}</strong></div>
          </div><p className="instruction">{game.action === "NONE" ? `${actionLabel(game.action, selected)} deliberately spends this asset’s action without thrust or fire.` : game.action === "DEPLOY" ? "DEPLOY uses the base action and sends the healthiest surviving reserve ship. The new ship receives its first action next round." : "Each deployed ship and base receives one action. Torpedoes fly ballistically after launch. Unassigned ships coast; all committed actions resolve before the shared motion interval."}</p></section>

          <section className="deck-section"><p className="eyebrow">Plot controls</p><div className="history-opacity-control">
            <label htmlFor="historyOpacity"><span>Tactical history</span><strong>{HISTORY_LABELS[game.settings.historyOpacity]}</strong></label>
            <input id="historyOpacity" type="range" min="0" max="3" step="1" list="historyLevels" value={game.settings.historyOpacity} aria-valuetext={HISTORY_LABELS[game.settings.historyOpacity]} onChange={(event) => setHistoryLevel(Number(event.target.value))}/>
            <datalist id="historyLevels">{HISTORY_LABELS.map((label, index) => <option key={label} value={index} label={label}/>)}</datalist><div className="history-notch-labels" aria-hidden="true">{HISTORY_LABELS.map((label) => <span key={label}>{label}</span>)}</div>
          </div><div className="history-opacity-control ui-scale-control">
            <label htmlFor="uiScale"><span>Interface scale</span><strong>{UI_SCALE_LABELS[uiScale]}</strong></label>
            <input id="uiScale" type="range" min="0" max="4" step="1" list="uiScaleLevels" value={uiScale} aria-valuetext={UI_SCALE_LABELS[uiScale]} onChange={(event) => setUiScale(Number(event.target.value))}/>
            <datalist id="uiScaleLevels">{UI_SCALE_LABELS.map((label, index) => <option key={label} value={index} label={label}/>)}</datalist><div className="history-notch-labels" aria-hidden="true">{UI_SCALE_LABELS.map((label) => <span key={label}>{label === "Extra large" ? "XL" : label}</span>)}</div>
          </div><div className="utility-row">
            <button type="button" onClick={focusSelected}>Focus unit</button><button type="button" onClick={fitBattlefield}>Fit battlefield</button>
            <button type="button" className={viewMode === "history" ? "ghost-active" : ""} onClick={() => setViewMode((m) => m === "tactical" ? "history" : "tactical")}>{viewMode === "tactical" ? "History view" : "Tactical view"}</button><button type="button" disabled={game.phase !== "gameover"} onClick={startReplay}>Watch replay</button>
            <button type="button" onClick={restart} style={{ gridColumn: "1 / -1" }}>Restart match</button>
          </div></section>

          <section className="deck-section mobile-collapse"><p className="eyebrow">Battle log</p><ul className="event-log">{game.log.slice(0, 4).map((line, i) => <li key={`${game.turn}-${i}`}><strong>{i === 0 ? "› " : "  "}</strong>{line}</li>)}</ul></section>
          <section className="deck-section mobile-collapse"><p className="eyebrow">Keyboard map</p><p className="help-copy"><kbd>Tab</kbd> focus · <kbd>[ ]</kbd> objects · <kbd>0</kbd> coast · <kbd>1–4</kbd> actions · <kbd>Arrows</kbd> vector · <kbd>Shift</kbd> fine · <kbd>Space</kbd> commit<br /><kbd>WASD</kbd> pan · <kbd>+/−</kbd> zoom · <kbd>F</kbd> fit · <kbd>H</kbd> history</p></section>
        </aside>
      </section>

      {game.phase === "setup" && <section className="setup-overlay" role="dialog" aria-modal="true" aria-labelledby="setup-title" aria-describedby="setup-description">
        <div className="setup-card">
          <p className="eyebrow">Fleet Rules · Match setup</p>
          <h2 id="setup-title">Graphite Fleet</h2>
          <p id="setup-description" className="setup-description">Gravity and persistent inertia are always active. Choose a local two-player match or face the CPU, then set the fleet size and commander colors. Every deployed ship and each base receives one action per round.</p>
          <p className="game-credit">Graphite Fleet is an independent, noncommercial adaptation. Inspired by a traditional pencil-and-paper space-combat game passed between classrooms and friends, professors and students. <strong>Thank you, Professor Armstrong.</strong></p>

          <fieldset className="rule-fieldset">
            <legend>Opponent</legend>
            <div className="rule-toggle">
              <button autoFocus type="button" aria-pressed={settingsDraft.opponent === "human"} className={settingsDraft.opponent === "human" ? "rule-choice active" : "rule-choice"} onClick={() => setSettingsDraft((settings) => ({ ...settings, opponent: "human" }))}><span>Local two-player</span><small>Two commanders share this screen and alternate planning.</small></button>
              <button type="button" aria-pressed={settingsDraft.opponent === "cpu"} className={settingsDraft.opponent === "cpu" ? "rule-choice active" : "rule-choice"} onClick={() => setSettingsDraft((settings) => ({ ...settings, opponent: "cpu" }))}><span>Play against CPU</span><small>Command the left fleet against a visible, deterministic tactical opponent.</small></button>
            </div>
          </fieldset>

          <fieldset className="rule-fieldset">
            <legend>Ships per commander</legend>
            <div className="rule-toggle">
              <button type="button" aria-pressed={settingsDraft.fleetSize === 3} className={settingsDraft.fleetSize === 3 ? "rule-choice active" : "rule-choice"} onClick={() => setSettingsDraft((s) => ({ ...s, fleetSize: 3 }))}><span>3 ships</span><small>Ten starting base HP. Faster fleet matches.</small></button>
              <button type="button" aria-pressed={settingsDraft.fleetSize === 6} className={settingsDraft.fleetSize === 6 ? "rule-choice active" : "rule-choice"} onClick={() => setSettingsDraft((s) => ({ ...s, fleetSize: 6 }))}><span>6 ships</span><small>Nineteen starting base HP and a longer campaign.</small></button>
            </div>
          </fieldset>

          <div className="color-picker-grid">
            {([0, 1] as const).map((player) => <fieldset className="rule-fieldset color-fieldset" key={player}><legend>Commander {player + 1} color</legend><div className="color-options">{COLOR_OPTIONS.map((option) => {
                    const selectedColor = settingsDraft.colors[player] === option.value;
                    const unavailable = settingsDraft.colors[1 - player] === option.value;
                    return <button key={option.value} type="button" disabled={unavailable} aria-pressed={selectedColor} aria-label={`${option.name}${unavailable ? ", selected by the other commander" : ""}`} className={selectedColor ? `color-choice active ${player === 1 ? "player-two" : ""}` : "color-choice"} onClick={() => setSettingsDraft((settings) => ({ ...settings, colors: player === 0 ? [option.value, settings.colors[1]] : [settings.colors[0], option.value] }))}><span className="color-swatch" style={{ backgroundColor: option.value }} aria-hidden="true"/><span>{option.name}</span></button>;
                })}</div></fieldset>)}
          </div>

          <p className="mobile-start-note">Best played on a desktop, or on a phone or tablet held horizontally.</p>
          <p className="setup-note">All ships begin inside the base with 3 HP each. Filled ships have 3 HP, half-filled ships 2 HP, and open ships 1 HP. Base HP equals the total HP of undeployed ships plus one core HP. Lasers deal 1 HP; torpedoes and collisions deal 2 HP.</p>
          <div className="setup-footer"><p><strong>ASSET COMMAND</strong><span>{settingsDraft.opponent === "cpu" ? "vs CPU" : "local 2-player"} · {settingsDraft.fleetSize} ships · one action per asset</span></p><button className="start-battle" type="button" onClick={startBattle}>Begin battle</button></div>
        </div>
      </section>}
      <div className="rotate-notice" role="status"><strong>Rotate to play</strong><span>Graphite Fleet is best played on desktop or in horizontal orientation.</span></div>
    </main>);
}
export default GraphiteFleet;
