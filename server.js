const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 8080;
const session = require('express-session');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cors());
/*Set up Admin API for Firebase*/
const admin = require('firebase-admin');
//Define path to secret key generated for service account
const serviceAccount = require("./soil-53c65-firebase-adminsdk-96cg8-f13c0165be.json");
//Initialize the app
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

let db = admin.firestore()
app.use(session({
  secret: 'your_secret_key', // Replace with a secure secret key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware to check if admin is logged in

// JWT secret key
const JWT_SECRET = 'your_jwt_secret_key'; // Replace with a secure secret key

// Middleware to check if admin is logged in
function checkAdminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).send('Unauthorized: Invalid token');
      } else {
        req.admin = decoded;
        next();
      }
    });
  } else {
    res.status(401).send('Unauthorized: No token provided');
  }
}

// Default admin credentials
const defaultAdmin = {
  username: 'admin',
  password: 'admin'
};

// Create default admin user on startup
async function createDefaultAdmin() {
  const adminRef = db.collection('admins').doc(defaultAdmin.username);
  const doc = await adminRef.get();
  if (!doc.exists) {
    const hashedPassword = await bcrypt.hash(defaultAdmin.password, 10);
    await adminRef.set({ username: defaultAdmin.username, password: hashedPassword });
    console.log('Default admin user created');
  } else {
    console.log('Default admin user already exists');
  }
}
createDefaultAdmin();
// Admin login
app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const adminRef = db.collection('admins').doc(username);
    const doc = await adminRef.get();

    if (!doc.exists) {
      return res.status(401).send('Invalid username or password');
    }

    const adminData = doc.data();
    const isMatch = await bcrypt.compare(password, adminData.password);

    if (isMatch) {
      const token = jwt.sign({ username: adminData.username }, JWT_SECRET, { expiresIn: '1h' });
      res.status(200).send({ token });
    } else {
      res.status(401).send('Invalid username or password');
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Admin logout
app.post('/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send('Failed to logout');
    }
    res.status(200).send('Logout successful');
  });
});

// Check Auth API
app.get('/admin/check-auth', checkAdminAuth, (req, res) => {
  res.status(200).send('Authorized');
});

// CRUD APIs with admin authorization
app.post('/employees', checkAdminAuth, async (req, res) => {
  try {
    const employee = req.body;
    const ref = await db.collection('employees').add(employee);
    res.status(201).send({ id: ref.id });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/employees/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await db.collection('employees').doc(id).get();
    if (!doc.exists) {
      res.status(404).send('Employee not found');
    } else {
      res.status(200).send(doc.data());
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/employees', checkAdminAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('employees').get();
    const employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).send(employees);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.put('/employees/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const employee = req.body;
    await db.collection('employees').doc(id).set(employee, { merge: true });
    res.status(200).send({'msg':'Employee updated'});
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.delete('/employees/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection('employees').doc(id).delete();
    res.status(200).send('Employee deleted');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// The same pattern for customers, services, memberships, and transactions

// Customers
// Add or update customer
app.post('/customers', checkAdminAuth, async (req, res) => {
  try {
    const { phone, name, services, total, useFromBalance } = req.body;

    if (!phone || !name || !services || !total) {
      return res.status(400).send('Missing required fields');
    }

    const customersRef = db.collection('customers');
    const snapshot = await customersRef.where('phone', '==', phone).get();

    if (!snapshot.empty) {
      // Customer exists, update balance
      const customer = snapshot.docs[0];
      const currentBalance = customer.data().balance || 0;

      let newBalance;
      console.log(currentBalance+"and"+useFromBalance)
      if (currentBalance < useFromBalance) {
        return res.status(400).send('Balance should be greater than or equal to current balance');
      } else {
        newBalance = currentBalance - useFromBalance;
        await customer.ref.update({ balance: newBalance });

        // Log the transaction
        await db.collection('transactions').add({
          customerId: customer.id,
          phone,
          date: new Date().toISOString(),
          amount: total,
          services,
          useFromBalance,
          type: 'Service'
        });

        return res.status(200).send({ message: 'Customer balance updated', newBalance, id: customer.id });
      }
    } else {
      // Customer doesn't exist, create new
      const newCustomer = {
        phone,
        name,
        services,
        balance: total - useFromBalance,
      };
      const ref = await customersRef.add(newCustomer);

      // Log the transaction for the new customer
      await db.collection('transactions').add({
        customerId: ref.id,
        phone,
        date: new Date().toISOString(),
        amount: total,
        services,
        useFromBalance,
        type: 'Service'
      });

      return res.status(201).send({ message: 'New customer created', id: ref.id });
    }
    
  } catch (error) {
    return res.status(500).send(error.message);
  }
});


app.get('/ping',  async (req, res) => {res.status(200).send("pong");})
app.get('/customers/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await db.collection('customers').doc(id).get();
    if (!doc.exists) {
      res.status(404).send('Customer not found');
    } else {
      res.status(200).send(doc.data());
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});
// Get customer by phone number
app.get('/customer/:phone', checkAdminAuth, async (req, res) => {
  try {
    const phone = req.params.phone;
    const snapshot = await db.collection('customers').where('phone', '==', phone).get();
    if (snapshot.empty) {
      res.status(404).send('Customer not found');
    } else {
      let customer = {};
      snapshot.forEach(doc => {
        customer = doc.data();
      });
      res.status(200).send(customer);
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/customers', checkAdminAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('customers').get();
    const customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).send(customers);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.put('/customers/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const customer = req.body;
    await db.collection('customers').doc(id).set(customer, { merge: true });
    res.status(200).send('Customer updated');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.delete('/customers/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection('customers').doc(id).delete();
    res.status(200).send('Customer deleted');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Services
app.post('/services', checkAdminAuth, async (req, res) => {
  try {
    const { servicename, amount } = req.body;
    
    if (!servicename || !amount) {
      return res.status(400).send('Missing required fields');
    }
    
    const servicesRef = db.collection('services');
    const snapshot = await servicesRef.where('servicename', '==', servicename).get();
    
    if (!snapshot.empty) {
      return res.status(400).send('Service already exists');
    }
    
    const newService = { servicename, amount };
    const ref = await servicesRef.add(newService);
    res.status(201).send({ id: ref.id });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Other service routes remain unchanged


app.get('/services/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await db.collection('services').doc(id).get();
    if (!doc.exists) {
      res.status(404).send('Service not found');
    } else {
      res.status(200).send(doc.data());
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/services', checkAdminAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('services').get();
    const services = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).send(services);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.put('/services/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const service = req.body;
    await db.collection('services').doc(id).set(service, { merge: true });
    res.status(201).send({ data: "'Service updated'" });

  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.delete('/services/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection('services').doc(id).delete();
    res.status(200).send('Service deleted');
  } catch (error) {
    res.status(500).send(error.message);
  }
});


// Transactions
app.post('/transactions', checkAdminAuth, async (req, res) => {
  try {
    const transaction = req.body;
    const ref = await db.collection('transactions').add(transaction);
    res.status(201).send({ id: ref.id });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/transactions/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await db.collection('transactions').doc(id).get();
    if (!doc.exists) {
      res.status(404).send('Transaction not found');
    } else {
      res.status(200).send(doc.data());
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/transactions', checkAdminAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('transactions').get();
    const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).send(transactions);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.put('/transactions/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const transaction = req.body;
    await db.collection('transactions').doc(id).set(transaction, { merge: true });
    res.status(200).send('Transaction updated');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.delete('/transactions/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection('transactions').doc(id).delete();
    res.status(200).send('Transaction deleted');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Create a discount
app.post('/discounts', checkAdminAuth, async (req, res) => {
  try {
    const discount = req.body;
    const ref = await db.collection('discounts').add(discount);
    res.status(201).send({ id: ref.id });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Get all discounts
app.get('/discounts', checkAdminAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('discounts').get();
    const discounts = [];
    snapshot.forEach(doc => {
      discounts.push({ id: doc.id, ...doc.data() });
    });
    res.status(200).send(discounts);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Get a discount by ID
app.get('/discounts/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await db.collection('discounts').doc(id).get();
    if (!doc.exists) {
      res.status(404).send('Discount not found');
    } else {
      res.status(200).send({ id: doc.id, ...doc.data() });
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Update a discount
app.put('/discounts/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;
    const ref = db.collection('discounts').doc(id);
    await ref.update(updatedData);
    res.status(200).send({ id: ref.id });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Delete a discount
app.delete('/discounts/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection('discounts').doc(id).delete();
    res.status(200).send('Discount deleted successfully');
  } catch (error) {
    res.status(500).send(error.message);
  }
});


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

// Membership CRUD APIs
app.post('/memberships', checkAdminAuth, async (req, res) => {
  try {
    const { name, amount, points } = req.body;
    if (!name || !amount || !points) {
      return res.status(400).send('Missing required fields');
    }
    const membership = { name, amount, points };
    const ref = await db.collection('memberships').add(membership);
    res.status(201).send({ id: ref.id });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/memberships/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await db.collection('memberships').doc(id).get();
    if (!doc.exists) {
      res.status(404).send('Membership not found');
    } else {
      res.status(200).send(doc.data());
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/memberships', checkAdminAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('memberships').get();
    const memberships = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).send(memberships);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.put('/memberships/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const { name, amount, points } = req.body;
    const membership = { name, amount, points };
    await db.collection('memberships').doc(id).set(membership, { merge: true });
    res.status(200).send('Membership updated');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.delete('/memberships/:id', checkAdminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection('memberships').doc(id).delete();
    res.status(200).send('Membership deleted');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Buy membership
app.post('/customers/:customerId/buy-membership', checkAdminAuth, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { membershipId } = req.body;

    if (!membershipId) {
      return res.status(400).send('Membership ID is required');
    }

    const membershipDoc = await db.collection('memberships').doc(membershipId).get();
    if (!membershipDoc.exists) {
      return res.status(404).send('Membership not found');
    }

    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) {
      return res.status(404).send('Customer not found');
    }

    const membership = membershipDoc.data();
    const customer = customerDoc.data();

    const newBalance = (parseInt(customer.balance) || 0) + parseInt(membership.points);    await db.collection('customers').doc(customerId).update({
      balance: newBalance,
      membership: membership.name,
    });
 // Log the transaction
 await db.collection('transactions').add({
  customerId,
  phone: customer.phone,
  date: new Date().toISOString(),
  amount: membership.amount,
  membershipId,
  membershipName: membership.name,
  points: membership.points,
  type: 'Membership'
});
    res.status(200).send({message:'Membership purchased successfully Current bal',newBalance});
  } catch (error) {
    res.status(500).send(error.message);
  }
});
app.listen(port, () => {
    console.log(`Proxy API listening at http://localhost:${port}`);
});
