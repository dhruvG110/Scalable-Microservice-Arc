
import pool from './db.js';
import redisClient from './redis.js';

const client = pool;
const CACHE_TTL_SECONDS = 300;

const userKeys = {
    all: () => 'users:all',
    byId: (id) => `users:id:${id}`,
    byEmail: (email) => `users:email:${String(email).trim().toLowerCase()}`
};

const postKeys = {
    all: () => 'posts:all',
    byId: (id) => `posts:id:${id}`,
    byTitle: (title) => `posts:title:${String(title).trim().toLowerCase()}`,
    byUserId: (userId) => `posts:user:${userId}`
};

const parseCacheValue = (value) => {
    if (value === null || value === undefined) return null;

    try {
        return JSON.parse(value);
    } catch (error) {
        return value;
    }
};

const safeRedisGet = async (key) => {
    try {
        const value = await redisClient.get(key);
        return parseCacheValue(value);
    } catch (error) {
        console.error(`[Redis] GET failed for ${key}:`, error.message);
        return null;
    }
};

const safeRedisSet = async (key, value) => {
    try {
        await redisClient.set(key, JSON.stringify(value), {
            EX: CACHE_TTL_SECONDS
        });
        console.log(`[Redis] Cached ${key}`);
    } catch (error) {
        console.error(`[Redis] SET failed for ${key}:`, error.message);
    }
};

const safeRedisDel = async (...keys) => {
    const validKeys = keys.filter(Boolean);

    if (!validKeys.length) return;

    try {
        await redisClient.del(...validKeys);
        console.log(`[Redis] Invalidated: ${validKeys.join(', ')}`);
    } catch (error) {
        console.error('[Redis] DELETE failed:', error.message);
    }
};

// all functions of user and post 
export async function createUser(name, email) {
    console.log('[createUser] started:', { name, email });

    try {
        const query = `
            INSERT INTO users (name, email)
            VALUES ($1, $2)
            RETURNING *;
        `;

        const result = await client.query(query, [name, email]);
        const user = result.rows[0];

        await safeRedisDel(userKeys.all(), userKeys.byEmail(email));

        if (user) {
            await safeRedisSet(userKeys.byId(user.id), user);
            await safeRedisSet(userKeys.byEmail(user.email), user);
        }

        console.log('[createUser] success:', user ? { id: user.id, email: user.email } : null);
        return user;
    } catch (error) {
        console.log('[createUser] error:', error.message);
        throw error;
    }
}

// 2. GET USER BY EMAIL
export async function getUser(email) {
    const cacheKey = userKeys.byEmail(email);
    console.log('[getUser] started:', { email });

    try {
        const cachedUser = await safeRedisGet(cacheKey);

        if (cachedUser) {
            console.log('[getUser] cache hit:', { id: cachedUser.id, email: cachedUser.email });
            return cachedUser;
        }

        const query = `
            SELECT * FROM users
            WHERE email = $1;
        `;

        const result = await client.query(query, [email]);
        const user = result.rows[0];

        if (user) {
            await safeRedisSet(cacheKey, user);
            await safeRedisSet(userKeys.byId(user.id), user);
        }

        console.log('[getUser] success:', user ? { id: user.id, email: user.email } : null);
        return user;
    } catch (error) {
        console.log('[getUser] error:', error.message);
        throw error;
    }
}

// 3. UPDATE USER
export async function updateUser(id, name, email) {
    console.log('[updateUser] started:', { id, name, email });

    try {
        const query = `
            UPDATE users
            SET name = $1, email = $2
            WHERE id = $3
            RETURNING *;
        `;

        const result = await client.query(query, [name, email, id]);
        const user = result.rows[0];

        if (user) {
            await safeRedisSet(userKeys.byId(user.id), user);
            await safeRedisSet(userKeys.byEmail(user.email), user);
            await safeRedisDel(userKeys.all());
        }

        console.log('[updateUser] success:', user ? { id: user.id, email: user.email } : null);
        return user;
    } catch (error) {
        console.log('[updateUser] error:', error.message);
        throw error;
    }
}

// 4. DELETE USER
export async function deleteUser(id) {
    console.log('[deleteUser] started:', { id });

    try {
        const query = `
            DELETE FROM users
            WHERE id = $1
            RETURNING *;
        `;

        const result = await client.query(query, [id]);
        const user = result.rows[0];

        if (user) {
            await safeRedisDel(userKeys.byId(user.id), userKeys.byEmail(user.email), userKeys.all());
        }

        console.log('[deleteUser] success:', user ? { id: user.id, email: user.email } : null);
        return user;
    } catch (error) {
        console.log('[deleteUser] error:', error.message);
        throw error;
    }
}

// 5. GET ALL USERS
export async function getAllUsers() {
    const cacheKey = userKeys.all();
    console.log('[getAllUsers] started');

    try {
        const cachedUsers = await safeRedisGet(cacheKey);

        if (Array.isArray(cachedUsers)) {
            console.log('[getAllUsers] cache hit:', cachedUsers.length);
            return cachedUsers;
        }

        const query = `
            SELECT * FROM users
            ORDER BY id;
        `;

        const result = await client.query(query);
        const users = result.rows;

        await safeRedisSet(cacheKey, users);

        console.log('[getAllUsers] success:', users.length);
        return users;
    } catch (error) {
        console.log('[getAllUsers] error:', error.message);
        throw error;
    }
}

// 6. GET USER BY ID
export async function getUserById(id) {
    const cacheKey = userKeys.byId(id);
    console.log('[getUserById] started:', { id });

    try {
        const cachedUser = await safeRedisGet(cacheKey);

        if (cachedUser) {
            console.log('[getUserById] cache hit:', { id: cachedUser.id, email: cachedUser.email });
            return cachedUser;
        }

        const query = `
            SELECT * FROM users
            WHERE id = $1;
        `;

        const result = await client.query(query, [id]);
        const user = result.rows[0];

        if (user) {
            await safeRedisSet(cacheKey, user);
            await safeRedisSet(userKeys.byEmail(user.email), user);
        }

        console.log('[getUserById] success:', user ? { id: user.id, email: user.email } : null);
        return user;
    } catch (error) {
        console.log('[getUserById] error:', error.message);
        throw error;
    }
}

// ==================== POST CRUD OPERATIONS ====================

// 7. CREATE POST
export async function createPost(user_id, title, content) {
    console.log('[createPost] started:', { user_id, title, content });

    try {
        const query = `
            INSERT INTO posts (user_id, title, content)
            VALUES ($1, $2, $3)
            RETURNING *;
        `;

        const result = await client.query(
            query,
            [user_id, title, content]
        );

        const post = result.rows[0];

        await safeRedisDel(postKeys.all(), postKeys.byUserId(user_id), postKeys.byTitle(title));

        if (post) {
            await safeRedisSet(postKeys.byId(post.id), post);
            await safeRedisSet(postKeys.byTitle(post.title), [post]);
            await safeRedisSet(postKeys.byUserId(post.user_id), [post]);
        }

        console.log('[createPost] success:', post ? { id: post.id, user_id: post.user_id, title: post.title } : null);
        return post;
    } catch (error) {
        console.log('[createPost] error:', error.message);
        throw error;
    }
}

// 8. GET POST BY TITLE
export async function getPost(title) {
    const cacheKey = postKeys.byTitle(title);
    console.log('[getPost] started:', { title });

    try {
        const cachedPosts = await safeRedisGet(cacheKey);

        if (Array.isArray(cachedPosts)) {
            console.log('[getPost] cache hit:', cachedPosts.length);
            return cachedPosts;
        }

        const query = `
            SELECT * FROM posts
            WHERE title = $1;
        `;

        const result = await client.query(query, [title]);
        const posts = result.rows;

        if (posts.length) {
            await safeRedisSet(cacheKey, posts);
        }

        console.log('[getPost] success:', posts.length);
        return posts;
    } catch (error) {
        console.log('[getPost] error:', error.message);
        throw error;
    }
}

// 9. UPDATE POST
export async function updatePost(id, title, content) {
    console.log('[updatePost] started:', { id, title, content });

    try {
        const query = `
            UPDATE posts
            SET title = $1, content = $2
            WHERE id = $3
            RETURNING *;
        `;

        const result = await client.query(
            query,
            [title, content, id]
        );

        const post = result.rows[0];

        if (post) {
            await safeRedisSet(postKeys.byId(post.id), post);
            await safeRedisSet(postKeys.byTitle(post.title), [post]);
            await safeRedisDel(postKeys.all(), postKeys.byUserId(post.user_id), postKeys.byTitle(title));
        }

        console.log('[updatePost] success:', post ? { id: post.id, user_id: post.user_id, title: post.title } : null);
        return post;
    } catch (error) {
        console.log('[updatePost] error:', error.message);
        throw error;
    }
}

// 10. DELETE POST
export async function deletePost(id) {
    console.log('[deletePost] started:', { id });

    try {
        const query = `
            DELETE FROM posts
            WHERE id = $1
            RETURNING *;
        `;

        const result = await client.query(query, [id]);
        const post = result.rows[0];

        if (post) {
            await safeRedisDel(postKeys.byId(post.id), postKeys.byTitle(post.title), postKeys.byUserId(post.user_id), postKeys.all());
        }

        console.log('[deletePost] success:', post ? { id: post.id, user_id: post.user_id, title: post.title } : null);
        return post;
    } catch (error) {
        console.log('[deletePost] error:', error.message);
        throw error;
    }
}

// 11. GET ALL POSTS
export async function getAllPosts() {
    const cacheKey = postKeys.all();
    console.log('[getAllPosts] started');

    try {
        const cachedPosts = await safeRedisGet(cacheKey);

        if (Array.isArray(cachedPosts)) {
            console.log('[getAllPosts] cache hit:', cachedPosts.length);
            return cachedPosts;
        }

        const query = `
            SELECT * FROM posts
            ORDER BY id;
        `;

        const result = await client.query(query);
        const posts = result.rows;

        await safeRedisSet(cacheKey, posts);

        console.log('[getAllPosts] success:', posts.length);
        return posts;
    } catch (error) {
        console.log('[getAllPosts] error:', error.message);
        throw error;
    }
}

// 12. GET POST BY ID
export async function getPostById(id) {
    const cacheKey = postKeys.byId(id);
    console.log('[getPostById] started:', { id });

    try {
        const cachedPost = await safeRedisGet(cacheKey);

        if (cachedPost) {
            console.log('[getPostById] cache hit:', { id: cachedPost.id, title: cachedPost.title });
            return cachedPost;
        }

        const query = `
            SELECT * FROM posts
            WHERE id = $1;
        `;

        const result = await client.query(query, [id]);
        const post = result.rows[0];

        if (post) {
            await safeRedisSet(cacheKey, post);
            await safeRedisSet(postKeys.byTitle(post.title), [post]);
        }

        console.log('[getPostById] success:', post ? { id: post.id, user_id: post.user_id, title: post.title } : null);
        return post;
    } catch (error) {
        console.log('[getPostById] error:', error.message);
        throw error;
    }
}

// 13. GET POSTS BY USER ID
export async function getPostsByUserId(user_id) {
    const cacheKey = postKeys.byUserId(user_id);
    console.log('[getPostsByUserId] started:', { user_id });

    try {
        const cachedPosts = await safeRedisGet(cacheKey);

        if (Array.isArray(cachedPosts)) {
            console.log('[getPostsByUserId] cache hit:', cachedPosts.length);
            return cachedPosts;
        }

        const query = `
            SELECT * FROM posts
            WHERE user_id = $1
            ORDER BY id;
        `;

        const result = await client.query(query, [user_id]);
        const posts = result.rows;

        if (posts.length) {
            await safeRedisSet(cacheKey, posts);
        }

        console.log('[getPostsByUserId] success:', posts.length);
        return posts;
    } catch (error) {
        console.log('[getPostsByUserId] error:', error.message);
        throw error;
    }
}