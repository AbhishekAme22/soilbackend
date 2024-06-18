const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cors());

app.post('/sendText', async (req, res) => {
    const { chatId, text, session } = req.body;

    // Target API URL (replace with the actual target URL)
    const targetUrl = 'http://34.125.149.177:3000/api/sendText';

    try {
        // Forward the request to the target API
        const response = await axios.post(targetUrl, { chatId, text, session });

        // Send the response from the target API back to the client
        res.status(response.status).json(response.data);
    } catch (error) {
        console.error('Error forwarding the request:', error.message);
        res.status(error.response ? error.response.status : 500).json({
            message: 'Error occurred while forwarding the request',
            error: error.message
        });
    }
});

app.listen(port, () => {
    console.log(`Proxy API listening at http://localhost:${port}`);
});
