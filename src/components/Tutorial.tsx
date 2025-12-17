import React, { useState } from 'react';
import { Modal } from './Modal';

interface TutorialProps {
    isOpen: boolean;
    onClose: () => void;
    showHelpOnly?: boolean; // ヘルプのみ表示モード
}

/**
 * サンプルタスクカード（デモ用）
 */
const SampleTaskCard: React.FC<{ title: string; priority: number; time?: string }> = ({ title, priority, time }) => (
    <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '0.5rem',
        border: '1px solid var(--border-color)'
    }}>
        <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            border: '2px solid var(--border-color)'
        }} />
        <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{title}</div>
            {time && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{time}</div>}
        </div>
        <span style={{
            background: priority >= 4 ? '#e74c3c' : priority >= 3 ? '#2ecc71' : '#3498db',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: 'bold'
        }}>P{priority}</span>
    </div>
);

/**
 * サンプルカレンダー日（デモ用）
 */
const SampleCalendarDay: React.FC<{ day: number; type?: '夜勤' | '日勤' | '休み' | null }> = ({ day, type }) => {
    const bgColor = type === '夜勤' ? '#8e44ad' : type === '日勤' ? '#3498db' : type === '休み' ? '#27ae60' : 'var(--bg-secondary)';
    return (
        <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: bgColor,
            color: type ? 'white' : 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85rem',
            fontWeight: type ? 'bold' : 'normal'
        }}>{day}</div>
    );
};

export const Tutorial: React.FC<TutorialProps> = ({ isOpen, onClose, showHelpOnly = false }) => {
    const [step, setStep] = useState(showHelpOnly ? -1 : 0);

    const tutorialSteps = [
        {
            title: "ようこそ！ Holiday Todo へ",
            content: (
                <div className="tutorial-step">
                    <div className="emoji-icon">🎉</div>
                    <p>
                        Holiday Todo は、あなたの<strong>空き時間</strong>を活用するタスク管理アプリです。
                    </p>
                    <div style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: '12px',
                        padding: '1rem',
                        marginTop: '1rem',
                        border: '1px solid var(--border-color)'
                    }}>
                        <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                            💡 「休日にやりたいこと」を溜めておけば、次の休日に自動でスケジュールを組んでくれます。
                        </p>
                    </div>
                </div>
            )
        },
        {
            title: "1. タスクを追加しよう",
            content: (
                <div className="tutorial-step">
                    <p style={{ marginBottom: '1rem' }}>
                        右下の <strong style={{ background: 'var(--primary-color)', color: 'white', padding: '2px 8px', borderRadius: '50%' }}>＋</strong> ボタンからタスクを追加します。
                    </p>
                    <div style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: '12px',
                        padding: '1rem',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                            📝 サンプルタスク
                        </div>
                        <SampleTaskCard title="部屋の掃除" priority={5} />
                        <SampleTaskCard title="読書（1時間）" priority={3} />
                        <SampleTaskCard title="映画を観る" priority={1} />
                    </div>
                    <ul className="tutorial-list">
                        <li><strong>P5 (高)</strong>: 絶対にやりたい！</li>
                        <li><strong>P1 (低)</strong>: 時間があったらでOK</li>
                    </ul>
                </div>
            )
        },
        {
            title: "2. 予定を登録しよう",
            content: (
                <div className="tutorial-step">
                    <p>
                        <strong>設定 → カレンダー読み込み</strong>から、予定を登録します。
                    </p>
                    <div style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: '12px',
                        padding: '1rem',
                        marginTop: '1rem',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                            📅 サンプルカレンダー
                        </div>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <SampleCalendarDay day={15} type="日勤" />
                            <SampleCalendarDay day={16} type="夜勤" />
                            <SampleCalendarDay day={17} type="休み" />
                            <SampleCalendarDay day={18} type="休み" />
                            <SampleCalendarDay day={19} type="日勤" />
                        </div>
                        <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                            🟢 休み　🔵 日勤　🟣 夜勤
                        </div>
                    </div>
                    <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
                        📱 Googleカレンダー連携 または 📁 ICSファイル読み込みに対応
                    </p>
                </div>
            )
        },
        {
            title: "3. 自動スケジューリング",
            content: (
                <div className="tutorial-step">
                    <div className="emoji-icon">🤖</div>
                    <p>
                        タスクと予定が揃うと、アプリが自動で「どの休日に何をやるか」を計画します。
                    </p>
                    <div style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: '12px',
                        padding: '1rem',
                        marginTop: '1rem',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                            📋 17日（休み）のスケジュール
                        </div>
                        <SampleTaskCard title="部屋の掃除" priority={5} time="08:00" />
                        <SampleTaskCard title="読書（1時間）" priority={3} time="10:00" />
                    </div>
                    <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        ⚙️ 設定で「開始時間」や「タスク間隔」を調整可能
                    </p>
                </div>
            )
        },
        {
            title: "準備完了！",
            content: (
                <div className="tutorial-step">
                    <div className="emoji-icon">🚀</div>
                    <p>さあ、まずはタスクを追加してみましょう！</p>
                    <div style={{
                        background: 'linear-gradient(135deg, var(--primary-color), var(--primary-dark))',
                        color: 'white',
                        borderRadius: '12px',
                        padding: '1rem',
                        marginTop: '1rem',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📝 → 📅 → ✅</div>
                        <div style={{ fontSize: '0.85rem' }}>タスク追加 → 自動スケジュール → 完了！</div>
                    </div>
                    <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        このチュートリアルは、設定画面からいつでも見返せます。
                    </p>
                </div>
            )
        }
    ];

    // ヘルプコンテンツ
    const helpContent = (
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <section style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }}>📝 タスク管理</h4>
                <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.8 }}>
                    <li><strong>優先度 (P1〜P5)</strong>: 高いほど優先的にスケジュール</li>
                    <li><strong>スケジュールタイプ</strong>:
                        <ul style={{ marginTop: '0.25rem' }}>
                            <li>⭐ 自動: 空いている休日に自動配置</li>
                            <li>🕐 時間指定: 特定の日時に固定</li>
                            <li>🔁 繰り返し: 毎日/毎週/毎月など定期的に繰り返す</li>
                        </ul>
                    </li>
                    <li><strong>週繰り返しの曜日選択</strong>: 「毎週」「隔週」で複数曜日を選択可能</li>
                    <li><strong>繰り返しタスクの削除</strong>: その回のみ削除、今後の予定は残る</li>
                    <li><strong>完了済みタスク</strong>: 折りたたみ表示、一括削除可能</li>
                </ul>
            </section>

            <section style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }}>📅 カレンダー</h4>
                <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.8 }}>
                    <li><strong>予定の種類</strong>: 夜勤🟣・日勤🔵・休み🟢・その他⚪</li>
                    <li><strong>休日判定</strong>: イベントなし or「休み」タイプの日</li>
                    <li><strong>日付タップ</strong>: 詳細表示、タスク追加・編集・削除が可能</li>
                    <li><strong>Googleカレンダー連携</strong>: 設定からワンタップで同期</li>
                    <li><strong>ICS読み込み</strong>: カレンダーアプリからエクスポートしたファイル</li>
                </ul>
            </section>

            <section style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }}>⏰ スケジュール設定</h4>
                <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.8 }}>
                    <li><strong>日勤後のタスク開始時間</strong>: 日勤や休みの日にタスクを開始する時刻</li>
                    <li><strong>夜勤明けのタスク開始時間</strong>: 夜勤明けの日にタスクを開始する時刻</li>
                    <li><strong>タスク間隔</strong>: タスク間の時間（30分〜6時間）</li>
                    <li><strong>1日の最大タスク数</strong>: 1日にスケジュールする上限</li>
                </ul>
            </section>

            <section style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }}>🔔 Discord通知</h4>
                <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.8 }}>
                    <li><strong>前日通知</strong>: 指定時刻に翌日のスケジュールを送信</li>
                    <li><strong>タスク開始通知</strong>: タスク開始0〜60分前に通知</li>
                    <li><strong>Webhook URL</strong>: Discordサーバーで作成したURLを設定</li>
                </ul>
            </section>

            <section style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }}>🎨 テーマ設定</h4>
                <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.8 }}>
                    <li><strong>ライト/ダーク/システム</strong>: お好みの表示モードを選択</li>
                </ul>
            </section>

            <section>
                <h4 style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }}>💾 データ管理</h4>
                <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.8 }}>
                    <li><strong>クラウド同期</strong>: ログインするとデータは自動保存</li>
                    <li><strong>エクスポート/インポート</strong>: JSONファイルでバックアップ可能</li>
                </ul>
            </section>
        </div>
    );

    const handleNext = () => {
        if (step < tutorialSteps.length - 1) {
            setStep(step + 1);
        } else {
            onClose();
            setTimeout(() => setStep(showHelpOnly ? -1 : 0), 300);
        }
    };

    const handleBack = () => {
        if (step > 0) {
            setStep(step - 1);
        }
    };

    // ヘルプモードの場合
    if (showHelpOnly || step === -1) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="📖 ヘルプ & ガイド">
                {helpContent}
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                    <button
                        className="btn-secondary"
                        onClick={() => setStep(0)}
                        style={{ marginRight: '0.5rem' }}
                    >
                        チュートリアルを見る
                    </button>
                    <button className="btn-primary" onClick={onClose}>
                        閉じる
                    </button>
                </div>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={tutorialSteps[step].title}>
            <div className="tutorial-content">
                {tutorialSteps[step].content}
            </div>
            <div className="tutorial-footer">
                <div className="step-indicators">
                    {tutorialSteps.map((_, i) => (
                        <span
                            key={i}
                            className={`indicator ${i === step ? 'active' : ''}`}
                            onClick={() => setStep(i)}
                            style={{ cursor: 'pointer' }}
                        />
                    ))}
                </div>
                <div className="button-group">
                    {step > 0 && (
                        <button className="btn-secondary" onClick={handleBack}>
                            戻る
                        </button>
                    )}
                    <button className="btn-primary" onClick={handleNext}>
                        {step === tutorialSteps.length - 1 ? '始める' : '次へ'}
                    </button>
                </div>
            </div>

            <style>{`
                .tutorial-step {
                    text-align: center;
                    padding: 0.5rem 0;
                }
                .emoji-icon {
                    font-size: 3.5rem;
                    margin-bottom: 0.75rem;
                    animation: bounce 2s infinite;
                }
                .tutorial-list {
                    text-align: left;
                    background: var(--bg-secondary);
                    padding: 0.75rem 1.5rem;
                    border-radius: 8px;
                    margin-top: 1rem;
                    border: 1px solid var(--border-color);
                }
                .tutorial-list li {
                    margin: 0.25rem 0;
                    font-size: 0.9rem;
                }
                .tutorial-footer {
                    margin-top: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    align-items: center;
                }
                .step-indicators {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 0.5rem;
                }
                .indicator {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: var(--border-color);
                    transition: all 0.3s;
                }
                .indicator.active {
                    background: var(--primary-color);
                    transform: scale(1.3);
                }
                .button-group {
                    display: flex;
                    gap: 1rem;
                    width: 100%;
                    justify-content: center;
                }
                .button-group button {
                    min-width: 100px;
                }
                @keyframes bounce {
                    0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
                    40% {transform: translateY(-15px);}
                    60% {transform: translateY(-8px);}
                }
            `}</style>
        </Modal>
    );
};
