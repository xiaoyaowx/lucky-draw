'use client';

import { useEffect, useMemo, useState } from 'react';

interface PoolBinding {
  poolId: string;
  probability: number;
}

interface PoolOption {
  id: string;
  name: string;
  count: number;
  isLive?: boolean;
}

interface Round {
  id: number;
  name: string;
  poolType?: 'preset' | 'live';
  poolBindings?: PoolBinding[];
}

const DEFAULT_POOL_ID = 'default';
const LIVE_POOL_ID = 'live';

function legacyBindings(round?: Round): PoolBinding[] {
  if (round?.poolBindings?.length) return round.poolBindings;
  return [{
    poolId: round?.poolType === 'live' ? LIVE_POOL_ID : DEFAULT_POOL_ID,
    probability: 100,
  }];
}

function sanitizeBindings(bindings: PoolBinding[]): PoolBinding[] {
  return bindings
    .map(binding => ({
      poolId: binding.poolId,
      probability: Number(binding.probability),
    }))
    .filter(binding => binding.poolId && Number.isFinite(binding.probability) && binding.probability > 0);
}

export default function RoundManager() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [poolOptions, setPoolOptions] = useState<PoolOption[]>([]);
  const [newName, setNewName] = useState('');
  const [newBindings, setNewBindings] = useState<PoolBinding[]>([{ poolId: DEFAULT_POOL_ID, probability: 100 }]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editBindings, setEditBindings] = useState<PoolBinding[]>([{ poolId: DEFAULT_POOL_ID, probability: 100 }]);

  useEffect(() => {
    fetchRounds();
    fetchPools();
  }, []);

  const poolNameById = useMemo(
    () => new Map(poolOptions.map(pool => [pool.id, pool.name])),
    [poolOptions],
  );

  const fetchRounds = async () => {
    const res = await fetch('/api/admin/rounds');
    const data = await res.json();
    setRounds(data.rounds || []);
  };

  const fetchPools = async () => {
    const res = await fetch('/api/admin/user-pools');
    const data = await res.json();
    const options = data.options || [];
    setPoolOptions(options);
    if (options.length > 0) {
      setNewBindings(prev => prev.map(binding => ({
        ...binding,
        poolId: options.some((pool: PoolOption) => pool.id === binding.poolId) ? binding.poolId : options[0].id,
      })));
    }
  };

  const bindingTotal = (bindings: PoolBinding[]) =>
    sanitizeBindings(bindings).reduce((sum, binding) => sum + binding.probability, 0);

  const bindingLabel = (round: Round) =>
    legacyBindings(round)
      .map(binding => `${poolNameById.get(binding.poolId) || binding.poolId} ${binding.probability}%`)
      .join(' / ');

  const handleAdd = async () => {
    const bindings = sanitizeBindings(newBindings);
    if (!newName.trim() || bindings.length === 0) return;
    await fetch('/api/admin/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), poolBindings: bindings }),
    });
    setNewName('');
    setNewBindings([{ poolId: poolOptions[0]?.id || DEFAULT_POOL_ID, probability: 100 }]);
    fetchRounds();
  };

  const handleUpdate = async (id: number) => {
    const bindings = sanitizeBindings(editBindings);
    if (!editName.trim() || bindings.length === 0) return;
    await fetch(`/api/admin/rounds/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), poolBindings: bindings }),
    });
    setEditingId(null);
    fetchRounds();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此轮次？')) return;
    await fetch(`/api/admin/rounds/${id}`, { method: 'DELETE' });
    fetchRounds();
  };

  const updateBinding = (
    bindings: PoolBinding[],
    index: number,
    updates: Partial<PoolBinding>,
    setter: (bindings: PoolBinding[]) => void,
  ) => {
    setter(bindings.map((binding, i) => i === index ? { ...binding, ...updates } : binding));
  };

  const addBinding = (bindings: PoolBinding[], setter: (bindings: PoolBinding[]) => void) => {
    setter([...bindings, { poolId: poolOptions[0]?.id || DEFAULT_POOL_ID, probability: 0 }]);
  };

  const removeBinding = (bindings: PoolBinding[], index: number, setter: (bindings: PoolBinding[]) => void) => {
    if (bindings.length <= 1) return;
    setter(bindings.filter((_, i) => i !== index));
  };

  const renderBindingEditor = (
    bindings: PoolBinding[],
    setter: (bindings: PoolBinding[]) => void,
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 280 }}>
      {bindings.map((binding, index) => (
        <div key={`${binding.poolId}-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={binding.poolId}
            onChange={e => updateBinding(bindings, index, { poolId: e.target.value }, setter)}
            style={{ flex: 1, minWidth: 150 }}
          >
            {poolOptions.map(pool => (
              <option key={pool.id} value={pool.id}>
                {pool.name} ({pool.count})
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            value={binding.probability}
            onChange={e => updateBinding(bindings, index, { probability: Number(e.target.value) }, setter)}
            style={{ width: 88 }}
          />
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>%</span>
          <button className="btn-danger btn-sm" onClick={() => removeBinding(bindings, index, setter)}>
            移除
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn-ghost btn-sm" onClick={() => addBinding(bindings, setter)}>添加用户池</button>
        <span style={{ color: bindingTotal(bindings) === 100 ? '#66bb6a' : '#ffd700', fontSize: 13 }}>
          总概率 {bindingTotal(bindings)}%
        </span>
      </div>
    </div>
  );

  return (
    <div className="manager-panel">
      <h2>轮次管理</h2>

      <div className="admin-card">
        <div className="admin-card-header">添加轮次</div>
        <div className="add-form" style={{ alignItems: 'flex-start' }}>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="输入轮次名称"
            style={{ flex: '0 0 180px', minWidth: 140 }}
          />
          {renderBindingEditor(newBindings, setNewBindings)}
          <button className="btn-primary" onClick={handleAdd}>添加轮次</button>
        </div>
      </div>

      <ul className="item-list">
        {rounds.map(round => (
          <li key={round.id} style={{ alignItems: editingId === round.id ? 'flex-start' : 'center' }}>
            {editingId === round.id ? (
              <>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{ flex: '0 0 160px' }}
                />
                {renderBindingEditor(editBindings, setEditBindings)}
                <button className="btn-primary btn-sm" onClick={() => handleUpdate(round.id)}>保存</button>
                <button className="btn-ghost btn-sm" onClick={() => setEditingId(null)}>取消</button>
              </>
            ) : (
              <>
                <span>
                  {round.name}
                  <span className="status-tag open" style={{ marginLeft: 8 }}>
                    {bindingLabel(round)}
                  </span>
                </span>
                <button className="btn-sm" onClick={() => {
                  setEditingId(round.id);
                  setEditName(round.name);
                  setEditBindings(legacyBindings(round));
                }}>编辑</button>
                <button className="btn-danger btn-sm" onClick={() => handleDelete(round.id)}>删除</button>
              </>
            )}
          </li>
        ))}
      </ul>

      {rounds.length === 0 && (
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: 20, fontSize: 14 }}>
          暂无轮次，请添加
        </p>
      )}
    </div>
  );
}
