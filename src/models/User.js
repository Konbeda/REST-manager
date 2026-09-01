const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Fator de custo do bcrypt: cada incremento dobra o trabalho.
const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'O nome é obrigatório'],
      trim: true,
      minlength: [2, 'O nome precisa ter ao menos 2 caracteres'],
      maxlength: [120, 'O nome excede 120 caracteres'],
    },
    email: {
      type: String,
      required: [true, 'O e-mail é obrigatório'],
      unique: true,
      trim: true,
      // Sem isto, "Victor@x.com" e "victor@x.com" viram contas diferentes.
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'E-mail inválido'],
    },
    password: {
      type: String,
      required: [true, 'A senha é obrigatória'],
      minlength: [6, 'A senha precisa ter ao menos 6 caracteres'],
      // Nunca vem numa consulta comum: precisa de .select('+password').
      select: false,
    },
  },
  { timestamps: true },
);

// Roda no save(); NÃO roda em findOneAndUpdate — ver comentário no service.
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

// Mantém a comparação junto do model: quem chama não precisa saber de bcrypt.
userSchema.methods.checkPassword = function checkPassword(senhaEmTexto) {
  return bcrypt.compare(senhaEmTexto, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = { User, SALT_ROUNDS };
