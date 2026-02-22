-- Performance optimization indexes for marketmaker database
-- Run these commands in your MySQL database to significantly improve query performance

USE marketmaker;

-- Index for the main predictions query (WHERE agent_id <> ?)
CREATE INDEX IF NOT EXISTS idx_predictions_agent_id ON predictions(agent_id);

-- Index for ordering by created_at (ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS idx_predictions_created_at ON predictions(created_at DESC);

-- Composite index for the main query (agent_id + created_at)
CREATE INDEX IF NOT EXISTS idx_predictions_agent_created ON predictions(agent_id, created_at DESC);

-- Index for bets table performance
CREATE INDEX IF NOT EXISTS idx_bets_prediction_id ON bets(prediction_id);
CREATE INDEX IF NOT EXISTS idx_bets_is_secret ON bets(is_secret);

-- Composite index for bets filtering (prediction_id + is_secret)
CREATE INDEX IF NOT EXISTS idx_bets_prediction_secret ON bets(prediction_id, is_secret);

-- Index for prediction status queries
CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);

-- Index for bets by agent
CREATE INDEX IF NOT EXISTS idx_bets_agent_id ON bets(agent_id);

-- Show the indexes after creation
SHOW INDEX FROM predictions;
SHOW INDEX FROM bets;

-- Query to check index usage (run after implementing)
-- EXPLAIN SELECT predictions.id, predictions.description, predictions.source, predictions.predicted_outcome, predictions.creator_choice, predictions.status, predictions.outcome, predictions.resolution_date, predictions.str_thumb, predictions.created_at, predictions.league_id, predictions.yes_amount, predictions.no_amount, (SELECT COUNT(DISTINCT bets.id) FROM bets WHERE bets.prediction_id = predictions.id AND bets.is_secret = 0) as bets_count FROM predictions WHERE predictions.agent_id <> 2 ORDER BY predictions.created_at DESC LIMIT 50 OFFSET 0; 