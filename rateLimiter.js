import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redisClient from "./redis.js";

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: Number(process.env.API_RATE_LIMIT_MAX ||  3),

    standardHeaders: "draft-8",
    legacyHeaders: false,

    message: {
        success: false,
        message: "Too many requests. Please try again later."
    },

    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: "api-rate-limit:"
    }),

    // Redis unavailable hone par API ko temporarily allow karo.
    passOnStoreError: true
});

export default apiLimiter;