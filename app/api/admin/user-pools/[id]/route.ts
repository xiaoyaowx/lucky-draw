import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_USER_POOL_ID,
  getUserPools,
  LIVE_USER_POOL_ID,
  normalizePoolNumbers,
  resetLotteryRecords,
  saveUserPools,
} from '@/lib/user-pools';
import { generateNumberPoolFromConfig, getConfig, getPrizesData, saveConfig, savePrizesData } from '@/lib/lottery';
import { getAutoGenerateBlockReason, getMemberIds, getRequiredMemberError, normalizeMembers } from '@/lib/participants';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate } from '@/lib/ws-manager';

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (id === LIVE_USER_POOL_ID) {
      return NextResponse.json({ error: 'Live pool cannot be edited here' }, { status: 400 });
    }

    const body = await request.json();
    const pools = getUserPools();
    const index = pools.findIndex(pool => pool.id === id);
    if (index === -1) {
      return NextResponse.json({ error: 'User pool not found' }, { status: 404 });
    }

    const nextPool = { ...pools[index] };
    let numbersChanged = false;

    if (typeof body.name === 'string' && body.name.trim()) {
      nextPool.name = body.name.trim();
    }

    if (body.generateConfig) {
      const schema = getConfig().participantSchema;
      const blockReason = getAutoGenerateBlockReason(schema);
      if (blockReason) {
        return NextResponse.json(
          { error: blockReason },
          { status: 400 },
        );
      }
      const generated = generateNumberPoolFromConfig({
        type: 'auto',
        start: body.generateConfig.start,
        end: body.generateConfig.end,
        excludeContains: Array.isArray(body.generateConfig.excludeContains)
          ? body.generateConfig.excludeContains
          : [],
        excludeExact: Array.isArray(body.generateConfig.excludeExact)
          ? body.generateConfig.excludeExact
          : [],
      });
      const generatedMembers = normalizeMembers(generated, schema, 'generate');
      const generatedIds = getMemberIds(generatedMembers);
      numbersChanged = !arraysEqual(nextPool.numbers, generatedIds) || JSON.stringify(nextPool.members) !== JSON.stringify(generatedMembers);
      nextPool.members = generatedMembers;
      nextPool.numbers = generatedIds;

      if (id === DEFAULT_USER_POOL_ID) {
        const config = getConfig();
        config.numberPoolConfig = {
          ...config.numberPoolConfig,
          type: 'auto',
          start: body.generateConfig.start,
          end: body.generateConfig.end,
          excludeContains: Array.isArray(body.generateConfig.excludeContains)
            ? body.generateConfig.excludeContains
            : [],
          excludeExact: Array.isArray(body.generateConfig.excludeExact)
            ? body.generateConfig.excludeExact
            : [],
        };
        delete config.numberPoolConfig.excludePatterns;
        saveConfig(config);
      }
    } else if (Array.isArray(body.members) || Array.isArray(body.numbers)) {
      const schema = getConfig().participantSchema;
      const nextMembers = Array.isArray(body.members)
        ? normalizeMembers(body.members, schema, 'manual')
        : normalizeMembers(normalizePoolNumbers(body.numbers), schema, 'manual');
      const memberError = getRequiredMemberError(nextMembers, schema);
      if (memberError) {
        return NextResponse.json({ error: memberError }, { status: 400 });
      }
      const nextNumbers = getMemberIds(nextMembers);
      numbersChanged = !arraysEqual(nextPool.numbers, nextNumbers) || JSON.stringify(nextPool.members) !== JSON.stringify(nextMembers);
      nextPool.members = nextMembers;
      nextPool.numbers = nextNumbers;
    }

    nextPool.updatedAt = Date.now();
    pools[index] = nextPool;
    saveUserPools(pools);

    if (numbersChanged) {
      resetLotteryRecords();
    }

    broadcastStateUpdate(getFullState());

    return NextResponse.json({ pool: nextPool, reset: numbersChanged });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to update user pool' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (id === DEFAULT_USER_POOL_ID || id === LIVE_USER_POOL_ID) {
      return NextResponse.json({ error: 'This pool cannot be deleted' }, { status: 400 });
    }

    const pools = getUserPools();
    const nextPools = pools.filter(pool => pool.id !== id);
    if (nextPools.length === pools.length) {
      return NextResponse.json({ error: 'User pool not found' }, { status: 404 });
    }

    saveUserPools(nextPools);

    const prizesData = getPrizesData();
    prizesData.rounds = prizesData.rounds.map(round => ({
      ...round,
      poolBindings: round.poolBindings?.filter(binding => binding.poolId !== id),
    }));
    savePrizesData(prizesData);
    resetLotteryRecords();
    broadcastStateUpdate(getFullState());

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to delete user pool' }, { status: 500 });
  }
}
