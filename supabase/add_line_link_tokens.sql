-- リンクトークンテーブル追加マイグレーション
-- 
-- LINE連携用のワンタイムトークンを管理するテーブル
-- ユーザーがLINE公式アカウントにトークンを送信すると、
-- そのユーザーのsettings.line_user_idが自動的に更新される

CREATE TABLE IF NOT EXISTS line_link_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス（トークン検索用）
CREATE INDEX IF NOT EXISTS idx_line_link_tokens_token ON line_link_tokens(token);
CREATE INDEX IF NOT EXISTS idx_line_link_tokens_user_id ON line_link_tokens(user_id);

-- RLSを有効化
ALTER TABLE line_link_tokens ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のトークンのみアクセス可能
CREATE POLICY "Users can only access their own tokens"
    ON line_link_tokens FOR ALL
    USING (auth.uid() = user_id);

-- Service Roleは全アクセス可能（Edge Functionから使用）
CREATE POLICY "Service role can access all tokens"
    ON line_link_tokens FOR ALL
    USING (auth.role() = 'service_role');
