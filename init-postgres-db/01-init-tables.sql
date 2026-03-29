-- 01-init-tables.sql
-- This runs automatically the FIRST time the postgres container starts

-- Create tables if they don't exist (idempotent)
CREATE TABLE IF NOT EXISTS accounts (
    account_id VARCHAR(50) PRIMARY KEY,
    balance NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_account VARCHAR(50) NOT NULL REFERENCES accounts(account_id),
    to_account VARCHAR(50) NOT NULL REFERENCES accounts(account_id),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    reason TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert demo accounts if they don't exist
INSERT INTO accounts (account_id, balance)
VALUES 
    ('checking-123', 1000.00),
    ('savings-456', 500.00)
ON CONFLICT (account_id) DO NOTHING;

-- Optional: Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_from_account ON transactions(from_account);
CREATE INDEX IF NOT EXISTS idx_transactions_to_account ON transactions(to_account);

\echo '✅ Initial database schema and demo data created successfully!'