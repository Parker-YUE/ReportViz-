-- ReportViz 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行

-- 邀请码表
CREATE TABLE IF NOT EXISTS invitation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(10) NOT NULL UNIQUE,
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note VARCHAR(100)
);

-- 解析记录表
CREATE TABLE IF NOT EXISTS parse_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_code VARCHAR(10) NOT NULL,
    input_filename VARCHAR(200),
    input_text_hash VARCHAR(64),
    result_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：按邀请码查记录
CREATE INDEX IF NOT EXISTS idx_parse_records_code ON parse_records(invitation_code);
-- 索引：按时间倒序查记录
CREATE INDEX IF NOT EXISTS idx_parse_records_created ON parse_records(created_at DESC);
-- 索引：按邀请码查使用次数（速率限制）
CREATE INDEX IF NOT EXISTS idx_parse_records_code_date ON parse_records(invitation_code, created_at);
