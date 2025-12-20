import React, { useState, useEffect } from 'react';
import type { TaskList } from '../types';
import { DEFAULT_LIST_COLORS } from '../types';
import { Modal } from './Modal';

interface ListEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    list: TaskList | null; // null = 新規作成
    onSave: (list: TaskList) => void;
    onDelete?: (id: string) => void;
}

/**
 * タスクリスト作成・編集モーダル
 * 
 * - リスト名入力
 * - カラー選択（プリセットから選択）
 * - 削除ボタン（デフォルトリストは削除不可）
 */
export const ListEditModal: React.FC<ListEditModalProps> = ({
    isOpen,
    onClose,
    list,
    onSave,
    onDelete
}) => {
    const [name, setName] = useState('');
    const [color, setColor] = useState(DEFAULT_LIST_COLORS[0]);

    // リスト変更時にフォームを初期化
    // モーダル表示時の初期化パターン（propsからの初期値設定）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        if (isOpen) {
            if (list) {
                setName(list.name);
                setColor(list.color);
            } else {
                setName('');
                setColor(DEFAULT_LIST_COLORS[0]);
            }
        }
    }, [list, isOpen]);

    const handleSave = () => {
        if (!name.trim()) return;

        const savedList: TaskList = {
            id: list?.id || crypto.randomUUID(),
            name: name.trim(),
            color,
            isDefault: list?.isDefault || false,
            createdAt: list?.createdAt || Date.now()
        };

        onSave(savedList);
        onClose();
    };

    const handleDelete = () => {
        if (list && !list.isDefault && onDelete) {
            if (window.confirm(`リスト「${list.name}」を削除しますか？\nこのリストに属するタスクはデフォルトリストに移動します。`)) {
                onDelete(list.id);
                onClose();
            }
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={list ? 'リストを編集' : '新しいリスト'}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* 名前入力 */}
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        リスト名
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="例: 仕事、プライベート"
                        style={{
                            width: '100%',
                            padding: '0.8rem',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-primary)'
                        }}
                        autoFocus
                    />
                </div>

                {/* カラー選択 */}
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        カラー
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {DEFAULT_LIST_COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
                                style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    backgroundColor: c,
                                    border: color === c ? '3px solid var(--text-primary)' : '2px solid transparent',
                                    cursor: 'pointer',
                                    transition: 'transform 0.1s',
                                    transform: color === c ? 'scale(1.1)' : 'scale(1)'
                                }}
                                aria-label={`色: ${c}`}
                            />
                        ))}
                    </div>
                </div>

                {/* プレビュー */}
                <div style={{
                    padding: '0.8rem',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderLeft: `4px solid ${color}`
                }}>
                    <span style={{ color }}>■</span>
                    <span style={{ marginLeft: '0.5rem' }}>{name || '（リスト名を入力）'}</span>
                </div>

                {/* ボタン */}
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1,
                            padding: '0.8rem',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            cursor: 'pointer'
                        }}
                    >
                        キャンセル
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!name.trim()}
                        style={{
                            flex: 1,
                            padding: '0.8rem',
                            border: 'none',
                            borderRadius: '8px',
                            backgroundColor: name.trim() ? 'var(--primary-color)' : 'var(--bg-tertiary)',
                            color: name.trim() ? 'white' : 'var(--text-muted)',
                            cursor: name.trim() ? 'pointer' : 'not-allowed',
                            fontWeight: 'bold'
                        }}
                    >
                        {list ? '保存' : '作成'}
                    </button>
                </div>

                {/* 削除ボタン（既存リスト編集時かつデフォルトでない場合のみ） */}
                {list && !list.isDefault && (
                    <button
                        onClick={handleDelete}
                        style={{
                            padding: '0.8rem',
                            border: 'none',
                            borderRadius: '8px',
                            backgroundColor: '#ff3b30',
                            color: 'white',
                            cursor: 'pointer',
                            width: '100%'
                        }}
                    >
                        🗑️ このリストを削除
                    </button>
                )}
            </div>
        </Modal>
    );
};
