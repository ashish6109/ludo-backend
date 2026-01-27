const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json()); // JSON support

// -------------------- MONGODB CONNECTION --------------------
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("Mongo DB Error:", err));


// -------------------- MODELS --------------------

// User Model
const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  wallet: { type: Number, default: 0 },
});
const User = mongoose.model("User", UserSchema);

// Transaction Model
const TxnSchema = new mongoose.Schema({
  userId: String,
  amount: Number,
  type: String,       // deposit / withdraw
  status: String,     // pending / success / failed
  createdAt: { type: Date, default: Date.now },
});
const Transaction = mongoose.model("Transaction", TxnSchema);


// -------------------- AUTH MIDDLEWARE --------------------
function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const data = jwt.verify(token, "SECRET123");
    req.userId = data.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}


// -------------------- ROUTES --------------------

// Root check
app.get("/", (req, res) => {
  res.send("Ludo backend running with wallet & webhook ✔");
});

// Signup
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  const exists = await User.findOne({ email });
  if (exists) return res.json({ error: "User already exists" });

  const hashed = await bcrypt.hash(password, 10);
  await User.create({ email, password: hashed });
  res.json({ success: true });
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.json({ error: "User not found" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ error: "Wrong password" });

  const token = jwt.sign({ id: user._id }, "SECRET123");
  res.json({ success: true, token });
});

// Get Wallet Info
app.get("/wallet", auth, async (req, res) => {
  const user = await User.findById(req.userId).select("wallet email");
  res.json(user);
});

// Withdraw Request
app.post("/withdraw", auth, async (req, res) => {
  const { amount } = req.body;
  const user = await User.findById(req.userId);

  if (user.wallet < amount) return res.json({ error: "Insufficient balance" });
  if (amount < 500) return res.json({ error: "Minimum withdraw ₹500" });

  user.wallet -= amount;
  await user.save();

  await Transaction.create({
    userId: req.userId,
    amount,
    type: "withdraw",
    status: "success",
  });

  res.json({ success: true, wallet: user.wallet });
});

// Deposit Webhook (GoCreator)
app.post("/webhook/gocreator", async (req, res) => {
  console.log("Webhook data:", req.body);
  
  const { email, amount, status } = req.body;

  if (status === "paid") {
    const user = await User.findOne({ email });
    if (user) {
      user.wallet += amount;
      await user.save();

      await Transaction.create({
        userId: user._id,
        amount,
        type: "deposit",
        status: "success",
      });
    }
  }

  res.status(200).send("WEBHOOK_OK");
});

// Game Logic
app.post("/play", auth, async (req, res) => {
  const user = await User.findById(req.userId);

  if (user.wallet <= 0) return res.json({ error: "No balance, deposit first" });

  // Rule 1: First time winner (wallet = 0 before)
  let result;

  if (user.wallet < 300) {
    result = "win";
    user.wallet += 50; // arbitrary reward
  } else {
    result = "lose";
    user.wallet -= 50; // arbitrary penalty
  }

  await user.save();
  res.json({ result, wallet: user.wallet });
});


// -------------------- START SERVER --------------------
app.listen(10000, () => console.log("Server running on port 10000"));
