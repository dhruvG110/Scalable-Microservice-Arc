import cluster from "cluster";
import os from "os";
import express from "express";
import routes from './route.js';
import {createUser} from './db_func.js';
import redisClient from './redis.js';
import helmet from "helmet";
import cors from "cors";
import apiLimiter from "./rateLimiter.js";
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/api', apiLimiter,routes);
const PORT = process.env.PORT || 3000;
async function startServer() {
    try {
        await redisClient.connect();
        console.log("Redis connected");
    } catch (error) {
        console.error("Redis connection failed:", error.message);
        // Redis unavailable ho toh app DB se kaam kar sakegi.
    }

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}, PID: ${process.pid}`);
    });
}

startServer();
app.get('/health', (req, res) => {
    console.log(`Request handled by PID: ${process.pid}`);
    res.status(200).json({
        status: 'ok',
        pid: process.pid
    });
});
