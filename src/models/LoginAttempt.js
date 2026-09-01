const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  count: {
    type: Number,
    default: 0,
  },
  // Momento em que a janela acaba.
  expiresAt: {
    type: Date,
    required: true,
  },
});

// expireAfterSeconds: 0 significa "expire NA data do campo", diferente do
// TTL relativo de 30 dias usado na lixeira de tasks. É o Mongo limpando a
// janela por nós, sem cron e sem código.
loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LoginAttempt = mongoose.model('LoginAttempt', loginAttemptSchema);

module.exports = { LoginAttempt };
