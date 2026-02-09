'use client';

import { useState, useEffect } from 'react';

interface Round {
  id: number;
  name: string;
  poolType?: 'preset' | 'live';
}

export default function RoundManager() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [newName, setNewName] = useState('');
  const [newPoolType, setNewPoolType] = useState<'preset' | 'live'>('preset');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPoolType, setEditPoolType] = useState<'preset' | 'live'>('preset');

  useEffect(() => {
    fetchRounds();
  }, []);

  const fetchRounds = async () => {
    const res = await fetch('/api/admin/rounds');
    const data = await res.json();
    setRounds(data.rounds || []);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await fetch('/api/admin/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, poolType: newPoolType }),
    });
    setNewName('');
    setNewPoolType('preset');
    fetchRounds();
  };

  const handleUpdate = async (id: number) => {
    await fetch(`/api/admin/rounds/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, poolType: editPoolType }),
    });
    setEditingId(null);
    fetchRounds();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此轮次？')) return;
    await fetch(`/api/admin/rounds/${id}`, { method: 'DELETE' });
    fetchRounds();
  };

  return (
    <div className="manager-panel">
      <h2>轮次管理</h2>

      <div className="add-form">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="输入轮次名称"
          style={{ flex: 1, minWidth: 140 }}
        />
        <select
          value={newPoolType}
          onChange={e => setNewPoolType(e.target.value as 'preset' | 'live')}
        >
          <option value="preset">预设号码池</option>
          <option value="live">签到登记池</option>
        </select>
        <button className="btn-primary" onClick={handleAdd}>添加轮次</button>
      </div>

      <ul className="item-list">
        {rounds.map(round => (
          <li key={round.id}>
            {editingId === round.id ? (
              <>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <select
                  value={editPoolType}
                  onChange={e => setEditPoolType(e.target.value as 'preset' | 'live')}
                >
                  <option value="preset">预设号码池</option>
                  <option value="live">签到登记池</option>
                </select>
                <button className="btn-primary btn-sm" onClick={() => handleUpdate(round.id)}>保存</button>
                <button className="btn-ghost btn-sm" onClick={() => setEditingId(null)}>取消</button>
              </>
            ) : (
              <>
                <span>
                  {round.name}
                  <span className={`status-tag ${round.poolType === 'live' ? 'open' : 'closed'}`}
                    style={{ marginLeft: 8 }}>
                    {round.poolType === 'live' ? '签到登记' : '预设池'}
                  </span>
                </span>
                <button className="btn-sm" onClick={() => {
                  setEditingId(round.id);
                  setEditName(round.name);
                  setEditPoolType(round.poolType || 'preset');
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
