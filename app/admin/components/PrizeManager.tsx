'use client';

import { useState, useEffect } from 'react';

interface Round {
  id: number;
  name: string;
}

interface Prize {
  id: string;
  level: string;
  name: string;
  quantity: number;
  color: string;
  sponsor: string;
}

export default function PrizeManager() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    level: '',
    name: '',
    quantity: 1,
    color: '#FFD700',
    sponsor: '',
  });

  useEffect(() => {
    fetchRounds();
  }, []);

  useEffect(() => {
    if (selectedRound) fetchPrizes();
  }, [selectedRound]);

  const fetchRounds = async () => {
    const res = await fetch('/api/admin/rounds');
    const data = await res.json();
    setRounds(data.rounds || []);
  };

  const fetchPrizes = async () => {
    const res = await fetch(`/api/admin/prizes?roundId=${selectedRound}`);
    const data = await res.json();
    setPrizes(data.prizes || []);
  };

  const resetForm = () => {
    setFormData({ level: '', name: '', quantity: 1, color: '#FFD700', sponsor: '' });
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!formData.level || !formData.name) return;

    if (editingId) {
      await fetch(`/api/admin/prizes/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
    } else {
      await fetch('/api/admin/prizes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, roundId: selectedRound }),
      });
    }
    resetForm();
    fetchPrizes();
  };

  const handleEdit = (prize: Prize) => {
    setEditingId(prize.id);
    setFormData({
      level: prize.level,
      name: prize.name,
      quantity: prize.quantity,
      color: prize.color,
      sponsor: prize.sponsor,
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此奖品？')) return;
    await fetch(`/api/admin/prizes/${id}`, { method: 'DELETE' });
    fetchPrizes();
  };

  return (
    <div className="manager-panel">
      <h2>奖品管理</h2>

      <div className="round-select">
        <label>选择轮次：</label>
        <select
          value={selectedRound || ''}
          onChange={e => setSelectedRound(Number(e.target.value))}
        >
          <option value="">请选择</option>
          {rounds.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {selectedRound && (
        <>
          <div className="admin-card">
            <div className="admin-card-header">
              {editingId ? '编辑奖品' : '添加奖品'}
            </div>
            <div className="prize-form">
              <input
                placeholder="奖项等级"
                value={formData.level}
                onChange={e => setFormData({ ...formData, level: e.target.value })}
                style={{ minWidth: 90 }}
              />
              <input
                placeholder="奖品名称"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                style={{ flex: 1, minWidth: 120 }}
              />
              <input
                type="number"
                placeholder="数量"
                value={formData.quantity}
                onChange={e => setFormData({ ...formData, quantity: Number(e.target.value) })}
                style={{ width: 70 }}
              />
              <input
                type="color"
                value={formData.color}
                onChange={e => setFormData({ ...formData, color: e.target.value })}
                title="奖项颜色"
              />
              <input
                placeholder="赞助商（选填）"
                value={formData.sponsor}
                onChange={e => setFormData({ ...formData, sponsor: e.target.value })}
                style={{ minWidth: 100 }}
              />
              <button className="btn-primary" onClick={handleSubmit}>{editingId ? '更新' : '添加'}</button>
              {editingId && <button className="btn-ghost" onClick={resetForm}>取消</button>}
            </div>
          </div>

          <ul className="item-list">
            {prizes.map(prize => (
              <li key={prize.id}>
                <span style={{ color: prize.color, flex: '0 0 auto', fontWeight: 600 }}>{prize.level}</span>
                <span>{prize.name}</span>
                <span style={{ flex: '0 0 auto', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>x{prize.quantity}</span>
                {prize.sponsor && (
                  <span style={{ flex: '0 0 auto', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{prize.sponsor}</span>
                )}
                <button className="btn-sm" onClick={() => handleEdit(prize)}>编辑</button>
                <button className="btn-danger btn-sm" onClick={() => handleDelete(prize.id)}>删除</button>
              </li>
            ))}
          </ul>

          {prizes.length === 0 && (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: 20, fontSize: 14 }}>
              暂无奖品，请添加
            </p>
          )}
        </>
      )}

      {!selectedRound && (
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: 30, fontSize: 14 }}>
          请先选择一个轮次
        </p>
      )}
    </div>
  );
}
