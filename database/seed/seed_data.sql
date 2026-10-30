-- ==============================================================================
-- Distributed AI/ML Job Processing Platform
-- Seed Data: Default Users, Pre-trained Models, Workers
-- ==============================================================================

-- 1. Default Administrator and Standard User
INSERT INTO users (id, username, email, password_hash, role)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'admin', 'admin@distml.local', '$2b$12$ayqEv8HlKRL.SStpooedtucA16ZtDad4I.Vqhw4OP3kgHjGJUQZHi', 'admin'),
    ('a0000000-0000-0000-0000-000000000002', 'user', 'user@distml.local', '$2b$12$DWOdqz7jcqtHvfuvADjN6.mG65kgl.d0oopCQ3hJ4lI76AvdV1YlO', 'standard_user')
ON CONFLICT (username) DO NOTHING;

-- 2. Pre-trained Sample Models in Registry
INSERT INTO model_registry (id, model_name, model_type, version, model_path, input_features_json, metrics_json, is_active)
VALUES
    (
        'b0000000-0000-0000-0000-000000000001',
        'Customer Churn Classifier',
        'RandomForestClassifier',
        '1.0.0',
        'ml/models/customer_churn_rf.joblib',
        '["tenure", "monthly_charges", "total_charges", "contract_type", "payment_method"]'::jsonb,
        '{"accuracy": 0.884, "precision": 0.862, "recall": 0.835, "f1": 0.848}'::jsonb,
        TRUE
    ),
    (
        'b0000000-0000-0000-0000-000000000002',
        'Housing Price Regressor',
        'GradientBoostingRegressor',
        '1.0.0',
        'ml/models/housing_price_gbr.joblib',
        '["square_feet", "bedrooms", "bathrooms", "year_built", "zipcode_density"]'::jsonb,
        '{"mae": 14250.8, "rmse": 21890.4, "r2": 0.912}'::jsonb,
        TRUE
    ),
    (
        'b0000000-0000-0000-0000-000000000003',
        'Credit Risk Assessor',
        'LogisticRegression',
        '1.0.0',
        'ml/models/credit_risk_lr.joblib',
        '["age", "annual_income", "credit_score", "debt_to_income", "loan_amount"]'::jsonb,
        '{"accuracy": 0.842, "precision": 0.810, "recall": 0.825, "f1": 0.817}'::jsonb,
        TRUE
    )
ON CONFLICT DO NOTHING;

-- 3. Initial Workers
INSERT INTO workers (id, name, hostname, status, max_concurrency, cpu_cores, total_ram_mb, has_gpu, supported_job_types, drain_mode)
VALUES
    (
        'worker-cpu-01',
        'Node-Worker-Alpha',
        'compute-node-01',
        'ONLINE',
        4,
        8,
        16384,
        FALSE,
        '["csv_batch_inference", "data_preprocessing", "model_evaluation", "model_training"]'::jsonb,
        FALSE
    ),
    (
        'worker-cpu-02',
        'Node-Worker-Beta',
        'compute-node-02',
        'ONLINE',
        4,
        8,
        16384,
        FALSE,
        '["csv_batch_inference", "data_preprocessing", "model_evaluation", "model_training", "image_classification"]'::jsonb,
        FALSE
    )
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    last_heartbeat_at = CURRENT_TIMESTAMP;
