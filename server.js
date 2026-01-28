const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

// ====== SECURITY & BODY PARSER FIXES ======
app.use(cors({ origin: "*", methods: ["GET","POST"] }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.set("trust proxy", 1);

// ====== MONGO DATABASE CONNECTION ======
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("Mongo DB Error:", err));

// ====== MODELS ======
const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  wallet: { type: Number, default: 0 }
});
const User = mongoose.model("User", UserSchema);

const TxnSchema = new mongoose.Schema({
  userId: String,
  amount: Number,
  type: String,   // deposit / withdraw
  status: String, // success / failed
  createdAt: { type: Date, default: Date.now }
});
const Transaction = mongoose.model("Transaction", TxnSchema);

// ====== AUTH MIDDLEWARE ======
function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Missing token" });

    const data = jwt.verify(token, "SECRET123");
    req.userId = data.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

// ====== ROOT TEST ======
app.get("/", (req, res) => {
  res.send("Ludo backend running ✔");
});

// ====== SIGNUP ======
app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if(!email || !password) return res.json({ error: "Invalid inputs" });

    const exists = await User.findOne({ email });
    if (exists) return res.json({ error: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    await User.create({ email, password: hashed });

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ error: "Signup failed" });
  }
});

// ====== LOGIN ======
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.json({ error: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ error: "Wrong password" });

    const token = jwt.sign({ id: user._id }, "SECRET123");
    res.json({ success: true, token });
  } catch (err) {
    res.json({ error: "Login failed" });
  }
});

// ====== GET WALLET ======
app.get("/wallet", auth, async (req, res) => {
  const user = await User.findById(req.userId).select("email wallet");
  res.json(user);
});

// ====== WITHDRAW ======
app.post("/withdraw", auth, async (req, res) => {
  try {
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
      status: "success"
    });

    res.json({ success: true, wallet: user.wallet });
  } catch (err) {
    res.json({ error: "Withdraw failed" });
  }
});

// ====== WEBHOOK (GoCreator Deposit) ======
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
        status: "success"
      });
    }
  }

  res.status(200).send("WEBHOOK_OK");
});

// ====== GAME LOGIC ======
app.post("/play", auth, async (req, res) => {
  const user = await User.findById(req.userId);

  if (user.wallet <= 0) return res.json({ error: "Deposit to play" });

  let result;

  if (user.wallet < 300) {
    result = "win";
    user.wallet += 50;
  } else {
    result = "lose";
    user.wallet -= 50;
  }

  await user.save();
  res.json({ result, wallet: user.wallet });
});

// ====== START SERVER ======
app.listen(10000, () => console.log("Server running on port 10000"));
