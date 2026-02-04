'use client';

import { useState, useEffect } from 'react';

interface Round {
  id: number;
  name: string;
}

export default function RoundManager() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

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
      body: JSON.stringify({ name: newName }),
    });
    setNewName('');
    fetchRounds();
  };

  const handleUpdate = async (id: number) => {
    await fetch(`/api/admin/rounds/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
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
        />
        <button onClick={handleAdd}>添加轮次</button>
      </div>

      <ul className="item-list">
        {rounds.map(round => (
          <li key={round.id}>
            {editingId === round.id ? (
              <>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                />
                <button onClick={() => handleUpdate(round.id)}>保存</button>
                <button onClick={() => setEditingId(null)}>取消</button>
              </>
            ) : (
              <>
                <span>{round.name}</span>
                <button onClick={() => {
                  setEditingId(round.id);
                  setEditName(round.name);
                }}>编辑</button>
                <button onClick={() => handleDelete(round.id)}>删除</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
