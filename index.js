const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());
const accountSid = 'AC4c2dc09f346e3f85a74bdf0b7168633c';
const authToken = 'c0fa93c84c6bed482123033cb6eaab7d';
const client = require('twilio')(accountSid, authToken);


// Define your API endpoint
app.post('/submit', (req, res) => {
    const { name, phoneNumber } = req.body;
    if (!name || !phoneNumber) {
        return res.status(400).json({ message: 'Name and phoneNumber are required' });
    }
    client.messages
    .create({
        body: 'Your appointment is coming up on July 22 at 3PM',
        from: 'whatsapp:+14155238886',
        to: 'whatsapp:'+phoneNumber
    })
    .then(message => console.log(message.sid)
)
    .done();
    // You can process the data here (e.g., save it to a database)
    // For now, just send back a success message
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
