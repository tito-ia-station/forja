export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  directus: {
    url: process.env.DIRECTUS_URL || 'http://localhost:8057',
    token: process.env.DIRECTUS_TOKEN || '',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
    timeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS || '30000', 10),
  },
  worker: {
    role: process.env.WORKER_ROLE || 'worker',
    minEduScore: parseFloat(process.env.MIN_EDU_SCORE || '4.5'),
    batchSize: parseInt(process.env.BATCH_SIZE || '50', 10),
  },
  alerts: {
    openclawNotify: process.env.OPENCLAW_NOTIFY === 'true',
    errorRateThreshold: parseFloat(process.env.ERROR_RATE_THRESHOLD || '0.1'),
    dlqAlertThreshold: parseInt(process.env.DLQ_ALERT_THRESHOLD || '100', 10),
  },
  queue: {
    maxSize: parseInt(process.env.QUEUE_MAX_SIZE || '500', 10),
    refillSize: parseInt(process.env.QUEUE_REFILL_SIZE || '100', 10),
    checkIntervalMs: parseInt(process.env.QUEUE_CHECK_INTERVAL_MS || '10000', 10),
  },
});
