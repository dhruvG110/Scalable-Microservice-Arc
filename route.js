
import express from 'express';

import {
    createUser,
    getUser,
    updateUser,
    deleteUser,
    getAllUsers,
    getUserById,
    createPost,
    getPost,
    updatePost,
    deletePost,
    getAllPosts,
    getPostById,
    getPostsByUserId
} from './db_func.js';

const router = express.Router();


// ==================== USER ENDPOINTS ====================

// 1. CREATE USER
// POST /users
router.post('/users', async (req, res) => {
    try {
        const { name, email } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                message: 'Name and email are required'
            });
        }

        const user = await createUser(name, email);

        res.status(201).json({
            message: 'User created successfully',
            data: user
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error creating user',
            error: error.message
        });
    }
});


// 2. GET USER BY EMAIL
// GET /users/email/:email
router.get('/users/email/:email', async (req, res) => {
    try {
        const user = await getUser(req.params.email);

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        res.status(200).json({
            data: user
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error fetching user',
            error: error.message
        });
    }
});


// 3. UPDATE USER
// PUT /users/:id
router.put('/users/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { name, email } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                message: 'Invalid user ID'
            });
        }

        if (!name || !email) {
            return res.status(400).json({
                message: 'Name and email are required'
            });
        }

        const user = await updateUser(id, name, email);

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        res.status(200).json({
            message: 'User updated successfully',
            data: user
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error updating user',
            error: error.message
        });
    }
});


// 4. DELETE USER
// DELETE /users/:id
router.delete('/users/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                message: 'Invalid user ID'
            });
        }

        const user = await deleteUser(id);

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        res.status(200).json({
            message: 'User deleted successfully',
            data: user
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error deleting user',
            error: error.message
        });
    }
});


// 5. GET ALL USERS
// GET /users
router.get('/users', async (req, res) => {
    try {
        const users = await getAllUsers();

        res.status(200).json({
            count: users.length,
            data: users
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error fetching users',
            error: error.message
        });
    }
});


// 6. GET USER BY ID
// GET /users/:id
router.get('/users/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                message: 'Invalid user ID'
            });
        }

        const user = await getUserById(id);

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        res.status(200).json({
            data: user
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error fetching user',
            error: error.message
        });
    }
});


// ==================== POST ENDPOINTS ====================

// 7. CREATE POST
// POST /posts
router.post('/posts', async (req, res) => {
    try {
        const { user_id, title, content } = req.body;

        if (!user_id || !title || !content) {
            return res.status(400).json({
                message: 'user_id, title and content are required'
            });
        }

        const post = await createPost(user_id, title, content);

        res.status(201).json({
            message: 'Post created successfully',
            data: post
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error creating post',
            error: error.message
        });
    }
});


// 8. GET POST BY TITLE
// GET /posts/title/:title
router.get('/posts/title/:title', async (req, res) => {
    try {
        const posts = await getPost(req.params.title);

        res.status(200).json({
            count: posts.length,
            data: posts
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error fetching post',
            error: error.message
        });
    }
});


// 9. UPDATE POST
// PUT /posts/:id
router.put('/posts/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { title, content } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                message: 'Invalid post ID'
            });
        }

        if (!title || !content) {
            return res.status(400).json({
                message: 'Title and content are required'
            });
        }

        const post = await updatePost(id, title, content);

        if (!post) {
            return res.status(404).json({
                message: 'Post not found'
            });
        }

        res.status(200).json({
            message: 'Post updated successfully',
            data: post
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error updating post',
            error: error.message
        });
    }
});


// 10. DELETE POST
// DELETE /posts/:id
router.delete('/posts/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                message: 'Invalid post ID'
            });
        }

        const post = await deletePost(id);

        if (!post) {
            return res.status(404).json({
                message: 'Post not found'
            });
        }

        res.status(200).json({
            message: 'Post deleted successfully',
            data: post
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error deleting post',
            error: error.message
        });
    }
});


// 11. GET ALL POSTS
// GET /posts
router.get('/posts', async (req, res) => {
    try {
        const posts = await getAllPosts();

        res.status(200).json({
            count: posts.length,
            data: posts
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error fetching posts',
            error: error.message
        });
    }
});


// 12. GET POST BY ID
// GET /posts/:id
router.get('/posts/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                message: 'Invalid post ID'
            });
        }

        const post = await getPostById(id);

        if (!post) {
            return res.status(404).json({
                message: 'Post not found'
            });
        }

        res.status(200).json({
            data: post
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error fetching post',
            error: error.message
        });
    }
});


// 13. GET POSTS BY USER ID
// GET /users/:userId/posts
router.get('/users/:userId/posts', async (req, res) => {
    try {
        const userId = Number(req.params.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                message: 'Invalid user ID'
            });
        }

        const posts = await getPostsByUserId(userId);

        res.status(200).json({
            count: posts.length,
            data: posts
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error fetching user posts',
            error: error.message
        });
    }
});


export default router;
