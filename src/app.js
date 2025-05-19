const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const taskRoutes = require('./routes/taskRoutes');
const authRoutes = require('./routes/authRoutes');

dotenv.config();

const app = express();


// --------- Middlewares ------------ //

app.use(cors());
app.use(express.json());
app.use('/api/tasks', taskRoutes);
app.use('/api/auth', authRoutes);

// ------------ rotas ----------//

app.get('/', (req, res) => {
    res.send('REST-manager está de pé');
});


module.exports = app;