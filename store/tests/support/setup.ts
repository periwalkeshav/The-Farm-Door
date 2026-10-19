// Test environment: a separate database and fixed secrets. Never points at live services.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/farmdoor_test";
process.env.APP_URL = "http://localhost:3000";
process.env.AUTH_SECRET = "test-auth-secret-test-auth-secret-0123456789";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.CRON_SECRET = "test-cron-secret-0123456789abcdef";
process.env.PAYMENTS_PROVIDER = "mock";
process.env.SHIPPING_PROVIDER = "mock";
process.env.EMAIL_TRANSPORT = "log";
process.env.RAZORPAY_KEY_ID = "rzp_test_dummy";
process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
