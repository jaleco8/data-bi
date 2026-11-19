ALTER TABLE chat.tool_call ADD COLUMN IF NOT EXISTS tool_use_id text;
ALTER TABLE chat.tool_call ADD COLUMN IF NOT EXISTS chart jsonb;
CREATE INDEX IF NOT EXISTS tool_call_tool_use_idx ON chat.tool_call (tool_use_id);
CREATE INDEX IF NOT EXISTS message_conversation_idx ON chat.message (conversation_id, message_id);
