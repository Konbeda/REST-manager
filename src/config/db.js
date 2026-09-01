const mongoose = require('mongoose');

const connectDB = async () => {
    try{
        await mongoose.connect(process.env.MONGO_URI);
        console.log('conectado ao MONGODB');
    } catch (err) {
        console.error('Erro ao conectar ao MONGODB: ', err.message);
        process.exit(1);
    }
};

module.exports = connectDB;