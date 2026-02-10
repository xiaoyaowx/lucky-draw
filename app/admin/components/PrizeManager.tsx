'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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
  image?: string;
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
    image: '',
  });
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setFormData({ level: '', name: '', quantity: 1, color: '#FFD700', sponsor: '', image: '' });
    setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFile = useCallback(async (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('仅支持 jpg/png/gif/webp 格式');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('文件大小不能超过 5MB');
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) {
        setFormData(prev => ({ ...prev, image: data.url }));
      } else {
        alert(data.error || '上传失败');
      }
    } catch {
      alert('上传失败');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handleRemoveImage = () => {
    setFormData(prev => ({ ...prev, image: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      image: prize.image || '',
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

            <div className="pool-section" style={{ marginTop: 14 }}>
              <h3 style={{ marginBottom: 10 }}>奖品配图（选填）</h3>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleUpload}
                style={{ display: 'none' }}
              />
              {formData.image ? (
                <div className="upload-preview">
                  <img src={formData.image} alt="奖品配图" />
                  <div className="upload-preview-actions">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      更换
                    </button>
                    <button
                      type="button"
                      className="btn-danger btn-sm"
                      onClick={handleRemoveImage}
                    >
                      移除
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`upload-dropzone${dragging ? ' dragover' : ''}${uploading ? ' uploading' : ''}`}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                >
                  {uploading ? (
                    <>
                      <svg className="upload-spinner" viewBox="0 0 24 24" width="28" height="28">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="50 20" />
                      </svg>
                      <span>上传中...</span>
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M20 16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2" strokeLinecap="round" />
                      </svg>
                      <span>点击或拖拽图片到此处</span>
                      <span style={{ fontSize: 11, opacity: 0.5 }}>jpg / png / gif / webp, 最大 5MB</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <ul className="item-list">
            {prizes.map(prize => (
              <li key={prize.id}>
                {prize.image && (
                  <img
                    src={prize.image}
                    alt={prize.name}
                    style={{
                      width: 56,
                      height: 40,
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.12)',
                      flex: '0 0 auto',
                    }}
                  />
                )}
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
