// src/app/api/admin/tournament/[id]/build-teams/route.ts
/*
Purpose: Build 8 balanced teams (A..H) from 24 SOLO players, with optional manual seeding, before tournament start.
Preconditions:

* Admin required (`requireAdminOr401`).
* Tournament must be `draft` and not canceled (`getTournamentFlags`).
* All accepted registrations must be paid (`assertAllAcceptedPaid`).
* Tournament `registration_mode` must be `SOLO`.
* Teams must not exist yet (prevents rebuilding without reset).
  Core algorithm:

1. Fetch 24 players for the tournament (`players` table), including `strength` and optional seed fields `seed_team_index` (1..8) and `seed_slot` (1..3). Reject if player count != 24.
2. Deterministic ranking for bucket assignment:

   * Normalize strength into [1..5].
   * Sort by strength desc, then by deterministic FNV-1a hash of `(playerId + tournamentId)` asc, then by `id` as final tie-break.
     This makes the “top/mid/bottom” segmentation stable across endpoints.
3. Split sorted list into 3 buckets of 8 players each (bucket1 strongest, bucket2 middle, bucket3 weakest).
4. Create 8 empty `teams` rows for the tournament.
5. Apply seeds (manual placements):

   * Take all players with `seed_team_index != null`.
   * Enforce max 8 seeded players and forbid duplicate `seed_team_index` in the request set.
   * For each seeded player, assign them into the requested team index (1..8) and into a free slot (preferred `seed_slot` if available, otherwise first free).
   * Track used players, occupied slots, and “bucket already used by team” to preserve bucket diversity.
6. Fill remaining slots per team using bucket pools:

   * Build pool1/pool2/pool3 from remaining players per bucket (excluding seeded).
   * Shuffle within each bucket (bucket membership is deterministic; only intra-bucket order is randomized).
   * First pass per team: try to take one player from each bucket not yet used by that team.
   * Second pass: if still not full (because a bucket ran out), fill from any pool, preferring unused buckets first, then any.
7. Validate output: must assign exactly 24 members (8 teams * 3 slots). Extra safety check: ensure no team has duplicate buckets (should be impossible when buckets are healthy).
8. Insert `team_members` rows.
9. Generate team display names by joining member names in slot order (`"P1 / P2 / P3"`) and update `teams.name`.
   Outcome: Creates balanced SOLO teams with stable bucket logic + optional manual seeding, ready for tournament start.
   */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";
import { getTournamentFlags } from "@/lib/tournamentGuards";
import { assertAllAcceptedPaid } from "@/lib/payments";

function shuffle<T>(a: T[]) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

type PlayerRow = {
    id: string;
    full_name: string;
    strength: number;
    seed_team_index: number | null; // 1..8
    seed_slot: number | null;       // 1..3
};

const TEAM_CODES = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

function clampInt(v: any, lo: number, hi: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

// bucketIndex: 1|2|3
function computeBuckets(sorted: PlayerRow[]) {
    // sorted length must be 24
    const b1 = sorted.slice(0, 8);
    const b2 = sorted.slice(8, 16);
    const b3 = sorted.slice(16, 24);

    const bucketByPlayer = new Map<string, 1 | 2 | 3>();
    for (const p of b1) bucketByPlayer.set(p.id, 1);
    for (const p of b2) bucketByPlayer.set(p.id, 2);
    for (const p of b3) bucketByPlayer.set(p.id, 3);

    return { b1, b2, b3, bucketByPlayer };
}

// Fast deterministic string hash (FNV-1a 32-bit)
function hash32FNV1a(str: string): number {
    let h = 0x811c9dc5; // 2166136261
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        // h *= 16777619 (with 32-bit overflow)
        h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h >>> 0;
}

/**
 * Deterministic sorting for buckets:
 *  - strength desc
 *  - hash(id + tournamentId) asc
 *  - id asc
 * This ensures bucket assignment is stable across endpoints.
 */
function sortPlayersDeterministic(players: PlayerRow[], tournamentId: string) {
    return [...players]
        .map((p) => ({ ...p, strength: clampInt(p.strength ?? 3, 1, 5) }))
        .sort((a, b) => {
            if (b.strength !== a.strength) return b.strength - a.strength;

            const ha = hash32FNV1a(String(a.id) + tournamentId);
            const hb = hash32FNV1a(String(b.id) + tournamentId);
            if (ha !== hb) return ha - hb;

            // tie-break for extremely rare hash collision
            return String(a.id).localeCompare(String(b.id));
        });
}

export async function POST(
    _req: Request,
    context: { params: Promise<{ id: string }> }
) {
    if (!(await requireAdminOr401())) {
        return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
    }

    const { id } = await context.params;
    const tournamentId = id;

    const f = await getTournamentFlags(tournamentId);
    if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
    if (f.status !== "draft") {
        return NextResponse.json({ ok: false, error: "Teams can be built only before the tournament starts" }, { status: 400 });
    }

    try {
        await assertAllAcceptedPaid(tournamentId);
    } catch {
        return NextResponse.json({ ok: false, error: "Р•СЃС‚СЊ РїРѕРґС‚РІРµСЂР¶РґС‘РЅРЅС‹Рµ Р·Р°СЏРІРєРё Р±РµР· РІР·РЅРѕСЃР°" }, { status: 400 });
    }

    const { data: t } = await supabaseAdmin
        .from("tournaments")
        .select("registration_mode")
        .eq("id", tournamentId)
        .single();

    if (t?.registration_mode !== "SOLO") {
        return NextResponse.json({ ok: false, error: "build-teams only for SOLO" }, { status: 400 });
    }

    // Prevent rebuilding if teams already exist
    const { data: existingTeams } = await supabaseAdmin
        .from("teams")
        .select("id")
        .eq("tournament_id", tournamentId)
        .limit(1);

    if ((existingTeams?.length ?? 0) > 0) {
        return NextResponse.json({ ok: false, error: "РљРѕРјР°РЅРґС‹ СѓР¶Рµ СЃРѕР·РґР°РЅС‹. РЎРЅР°С‡Р°Р»Р° СѓРґР°Р»РёС‚Рµ РєРѕРјР°РЅРґС‹/СЃРѕСЃС‚Р°РІС‹." }, { status: 400 });
    }

    const { data: playersRaw } = await supabaseAdmin
        .from("players")
        .select("id, full_name, strength, seed_team_index, seed_slot")
        .eq("tournament_id", tournamentId);

    const players = (playersRaw ?? []) as PlayerRow[];

    if (players.length !== 24) {
        return NextResponse.json(
            { ok: false, error: `РќСѓР¶РЅРѕ 24 РёРіСЂРѕРєР°, СЃРµР№С‡Р°СЃ ${players.length}` },
            { status: 400 }
        );
    }

    // Deterministic bucket assignment (no random shuffle)
    const sorted = sortPlayersDeterministic(players, tournamentId);
    const { b1, b2, b3, bucketByPlayer } = computeBuckets(sorted);

    // Create 8 teams A..H
    const { data: createdTeams, error: eTeams } = await supabaseAdmin
        .from("teams")
        .insert(
            Array.from({ length: 8 }, (_, i) => ({
                tournament_id: tournamentId,
                name: `TBD`,
                points: 0,
            }))
        )
        .select("id");

    if (eTeams || !createdTeams) {
        return NextResponse.json({ ok: false, error: eTeams }, { status: 400 });
    }

    // Helper structures
    const teamIdByIndex = new Map<number, string>(); // 1..8 -> id
    createdTeams.forEach((t, idx) => teamIdByIndex.set(idx + 1, t.id));

    const usedPlayer = new Set<string>();
    const occupiedSlot = new Set<string>(); // `${teamId}:${slot}`
    const usedBucketByTeam = new Map<string, Set<number>>(); // teamId -> buckets already used

    function markTeamBucket(teamId: string, bucket: number) {
        const s = usedBucketByTeam.get(teamId) ?? new Set<number>();
        s.add(bucket);
        usedBucketByTeam.set(teamId, s);
    }

    function isTeamBucketUsed(teamId: string, bucket: number) {
        return (usedBucketByTeam.get(teamId)?.has(bucket) ?? false);
    }

    function firstFreeSlot(teamId: string, preferredSlot?: number | null) {
        const all = [1, 2, 3];
        if (preferredSlot && all.includes(preferredSlot)) {
            if (!occupiedSlot.has(`${teamId}:${preferredSlot}`)) return preferredSlot;
        }
        return all.find((s) => !occupiedSlot.has(`${teamId}:${s}`)) ?? null;
    }

    const memberRows: { team_id: string; player_id: string; slot: number }[] = [];

    // Apply seeds from players table
    const seeds = players
        .filter((p) => p.seed_team_index != null)
        .map((p) => ({
            player_id: p.id,
            team_index: clampInt(p.seed_team_index, 1, 8),
            seed_slot: p.seed_slot ? clampInt(p.seed_slot, 1, 3) : null,
        }));

    if (seeds.length > 8) {
        return NextResponse.json({ ok: false, error: "РњРѕР¶РЅРѕ РїРѕСЃРµСЏС‚СЊ РјР°РєСЃРёРјСѓРј 8 РёРіСЂРѕРєРѕРІ" }, { status: 400 });
    }

    // Ensure no duplicate team_index in seeds (DB should enforce anyway)
    const dupTeam = new Set<number>();
    for (const s of seeds) {
        if (dupTeam.has(s.team_index)) {
            return NextResponse.json({ ok: false, error: "РќРµР»СЊР·СЏ РїРѕСЃРµСЏС‚СЊ РґРІСѓС… РёРіСЂРѕРєРѕРІ РІ РѕРґРЅСѓ РєРѕРјР°РЅРґСѓ" }, { status: 400 });
        }
        dupTeam.add(s.team_index);
    }

    for (const s of seeds) {
        const teamId = teamIdByIndex.get(s.team_index)!;
        const slot = firstFreeSlot(teamId, s.seed_slot);
        if (!slot) {
            return NextResponse.json({ ok: false, error: `Р’ РєРѕРјР°РЅРґРµ ${s.team_index} РЅРµС‚ СЃРІРѕР±РѕРґРЅРѕРіРѕ СЃР»РѕС‚Р°` }, { status: 400 });
        }

        memberRows.push({ team_id: teamId, player_id: s.player_id, slot });
        usedPlayer.add(s.player_id);
        occupiedSlot.add(`${teamId}:${slot}`);

        const bucket = bucketByPlayer.get(s.player_id);
        if (bucket) markTeamBucket(teamId, bucket);
    }

    // Prepare available pools per bucket (excluding seeded)
    const pool1 = b1.map((p) => p.id).filter((pid) => !usedPlayer.has(pid));
    const pool2 = b2.map((p) => p.id).filter((pid) => !usedPlayer.has(pid));
    const pool3 = b3.map((p) => p.id).filter((pid) => !usedPlayer.has(pid));

    // Optional randomness inside each bucket for team composition
    // (bucket membership is stable, only intra-bucket order is random)
    shuffle(pool1);
    shuffle(pool2);
    shuffle(pool3);

    function pickFromPool(pool: string[]) {
        while (pool.length) {
            const pid = pool.pop()!;
            if (!usedPlayer.has(pid)) return pid;
        }
        return null;
    }

    // Fill each team up to 3 players using buckets logic
    for (let teamIndex = 1; teamIndex <= 8; teamIndex++) {
        const teamId = teamIdByIndex.get(teamIndex)!;

        // Determine which buckets we want to use (prefer 1,2,3 but skip used by seed)
        const desiredBuckets = [1, 2, 3].filter((b) => !isTeamBucketUsed(teamId, b));

        // First pass: try to take one from each desired bucket
        for (const b of desiredBuckets) {
            const slot = firstFreeSlot(teamId, null);
            if (!slot) break;

            const pid =
                b === 1 ? pickFromPool(pool1) :
                    b === 2 ? pickFromPool(pool2) :
                        pickFromPool(pool3);

            if (!pid) continue;

            memberRows.push({ team_id: teamId, player_id: pid, slot });
            usedPlayer.add(pid);
            occupiedSlot.add(`${teamId}:${slot}`);
            markTeamBucket(teamId, b);
        }

        // Second pass: if team still not full (because some bucket ran out), fill from any remaining pools
        while (true) {
            const slot = firstFreeSlot(teamId, null);
            if (!slot) break;

            // Prefer buckets not used yet for this team, but if impossible вЂ” allow any
            const candidateBuckets = [1, 2, 3].filter((b) => !isTeamBucketUsed(teamId, b));
            const tryOrder = candidateBuckets.length ? candidateBuckets : [1, 2, 3];

            let picked: { pid: string; bucket: number } | null = null;
            for (const b of tryOrder) {
                const pid =
                    b === 1 ? pickFromPool(pool1) :
                        b === 2 ? pickFromPool(pool2) :
                            pickFromPool(pool3);

                if (pid) { picked = { pid, bucket: b }; break; }
            }

            if (!picked) break;

            memberRows.push({ team_id: teamId, player_id: picked.pid, slot });
            usedPlayer.add(picked.pid);
            occupiedSlot.add(`${teamId}:${slot}`);
            markTeamBucket(teamId, picked.bucket);
        }
    }

    // Validate we assigned exactly 24 players into 8*3 slots
    if (memberRows.length !== 24) {
        return NextResponse.json({ ok: false, error: `РќРµ СѓРґР°Р»РѕСЃСЊ СЂР°СЃРїСЂРµРґРµР»РёС‚СЊ РІСЃРµС… РёРіСЂРѕРєРѕРІ. РќР°Р·РЅР°С‡РµРЅРѕ: ${memberRows.length}/24` }, { status: 400 });
    }

    // Extra safety: ensure no duplicate buckets in the same team (when buckets are well-formed)
    const bucketsByTeam: Record<string, number[]> = {};
    for (const r of memberRows) {
        const b = bucketByPlayer.get(r.player_id);
        if (!b) continue;
        (bucketsByTeam[r.team_id] ??= []).push(b);
    }
    const dupTeams = Object.entries(bucketsByTeam)
        .map(([teamId, buckets]) => {
            const dup = buckets.length !== new Set(buckets).size;
            return dup ? { teamId, buckets } : null;
        })
        .filter(Boolean);

    if (dupTeams.length > 0) {
        return NextResponse.json(
            {
                ok: false,
                error: "РћР±РЅР°СЂСѓР¶РµРЅС‹ РґСѓР±Р»Рё РєРѕСЂР·РёРЅ РІРЅСѓС‚СЂРё РєРѕРјР°РЅРґС‹ (РѕС€РёР±РєР° СЂР°СЃРїСЂРµРґРµР»РµРЅРёСЏ/РїРѕСЃРµРІР°).",
                details: dupTeams,
            },
            { status: 400 }
        );
    }

    const { error: eIns } = await supabaseAdmin.from("team_members").insert(memberRows);
    if (eIns) return NextResponse.json({ ok: false, error: eIns }, { status: 400 });

    // Build team names (prefix + players)
    const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("team_id, slot, players(full_name)")
        .in("team_id", createdTeams.map((t) => t.id));

    const namesByTeam = new Map<string, string[]>();
    for (const m of members ?? []) {
        const arr = namesByTeam.get(m.team_id) ?? [];
        // @ts-ignore
        arr[m.slot - 1] = m.players.full_name;
        namesByTeam.set(m.team_id, arr);
    }

    for (let i = 0; i < createdTeams.length; i++) {
        const teamId = createdTeams[i].id;
        const parts = namesByTeam.get(teamId) ?? [];
        const name = `${parts.filter(Boolean).join(" / ")}`;
        await supabaseAdmin.from("teams").update({ name }).eq("id", teamId);
    }

    return NextResponse.json({ ok: true });
}
